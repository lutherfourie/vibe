// vibe daemon: reliable Windows (and other) startup service for Vibe self-build / Grok build loop.
// - Starts on boot (via Task Scheduler / NSSM).
// - Completely idle (near-zero CPU) until triggered.
// - Remote control via Supabase agent_commands (from dashboard, PWA, chat "vibe: ..." commands).
// - Local control HTTP on 127.0.0.1:3737 for direct triggers and status.
// - Supports: start loop, next (with arg), status, pause, update (git pull + graceful restart).
// - Self-healing restart wrapper recommended in launcher.
// - Logs + progress emitted to Supabase for live dashboard/PWA.

package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/lutherfourie/vibe/go/agent"
	"github.com/lutherfourie/vibe/go/internal/remote"
)

const (
	defaultControlAddr = "127.0.0.1:3737"
	daemonLogFile      = "vibe-daemon.out.log"
	daemonErrFile      = "vibe-daemon.err.log"
	maxRingLines       = 200
)

type daemonState struct {
	mu           sync.RWMutex
	Status       string    `json:"status"` // idle | running | paused | updating
	CurrentWork  string    `json:"current_work"`
	LastTrigger  time.Time `json:"last_trigger"`
	LastUpdate   time.Time `json:"last_update"`
	GitHead      string    `json:"git_head"`
	PID          int       `json:"pid"`
	Logs         []string  `json:"logs"`
	LoopRunning  bool      `json:"loop_running"`
}

type controlRequest struct {
	Command string         `json:"command"`
	Payload map[string]any `json:"payload,omitempty"`
}

type controlResponse struct {
	Success bool   `json:"success"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

var (
	state       = &daemonState{Status: "idle", PID: os.Getpid()}
	stateMu     sync.RWMutex // alias for state
	ringMu      sync.Mutex
	logRing     []string
	workMu      sync.Mutex
	workRunning bool
)

func appendLog(line string) {
	ringMu.Lock()
	defer ringMu.Unlock()
	ts := time.Now().Format("15:04:05")
	entry := fmt.Sprintf("%s %s", ts, line)
	logRing = append(logRing, entry)
	if len(logRing) > maxRingLines {
		logRing = logRing[len(logRing)-maxRingLines:]
	}
	// Also tee to files (best effort)
	appendToFile(daemonLogFile, entry+"\n")
}

func appendToFile(name, s string) {
	f, err := os.OpenFile(name, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.WriteString(s)
}

func getRing() []string {
	ringMu.Lock()
	defer ringMu.Unlock()
	out := make([]string, len(logRing))
	copy(out, logRing)
	return out
}

func setStatus(s string) {
	state.mu.Lock()
	state.Status = s
	state.mu.Unlock()
	appendLog("STATE -> " + s)
}

func setWork(w string) {
	state.mu.Lock()
	state.CurrentWork = w
	state.mu.Unlock()
	appendLog("WORK: " + w)
}

func snapshotState() daemonState {
	state.mu.RLock()
	defer state.mu.RUnlock()
	return daemonState{
		Status:      state.Status,
		CurrentWork: state.CurrentWork,
		LastTrigger: state.LastTrigger,
		LastUpdate:  state.LastUpdate,
		GitHead:     state.GitHead,
		PID:         state.PID,
		LoopRunning: workRunning,
		Logs:        getRing(),
	}
}

func runDaemon(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("daemon", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	controlAddr := flags.String("addr", defaultControlAddr, "local control HTTP bind addr (loopback recommended)")
	sessionID := flags.String("session", os.Getenv("VIBE_DAEMON_SESSION"), "Supabase agent session id for remote C&C (required for chat/dashboard/PWA control)")
	pollInterval := flags.Duration("poll", 15*time.Second, "remote poll interval (low value = responsive, still near-zero CPU)")
	_ = flags.Parse(args)

	appendLog("=== vibe daemon starting ===")
	appendLog(fmt.Sprintf("pid=%d os=%s arch=%s addr=%s", os.Getpid(), runtime.GOOS, runtime.GOARCH, *controlAddr))
	if *sessionID == "" {
		appendLog("WARNING: no --session / VIBE_DAEMON_SESSION provided. Remote commands (chat, PWA, hosted dashboard) will be ignored. Local /control still works.")
	} else {
		appendLog("remote session: " + *sessionID)
	}

	// Capture current git head
	if head := getGitHead(ctx); head != "" {
		state.mu.Lock()
		state.GitHead = head
		state.mu.Unlock()
		appendLog("git: " + head)
	}

	// Start control HTTP server (the main always-listening idle surface)
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok\n"))
	})
	mux.HandleFunc("/status", handleStatus)
	mux.HandleFunc("/control", handleControl)
	mux.HandleFunc("/logs", handleLogs)

	srv := &http.Server{
		Addr:    *controlAddr,
		Handler: mux,
	}

	go func() {
		appendLog("control server listening on http://" + *controlAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			appendLog("control server error: " + err.Error())
		}
	}()

	// Start remote poller if session provided. This is the bridge for "vibe: start loop", dashboard buttons, PWA.
	var ctrl *agent.RemoteControl
	if *sessionID != "" {
		client := remote.NewClient()
		ctrl = agent.NewRemoteControl(client, *sessionID)
		_ = ctrl.EmitTelemetry(ctx, "daemon_started", "daemon", map[string]any{
			"pid":  os.Getpid(),
			"addr": *controlAddr,
		})

		// Custom handler that understands loop commands + delegates to local exec
		handler := func(cmd remote.AgentCommand) {
			appendLog(fmt.Sprintf("[remote] cmd=%s from=%s", cmd.Command, cmd.IssuedBy))
			// Map friendly aliases
			c := normalizeCommand(cmd.Command)
			switch c {
			case "loop:start", "start", "start-loop", "vibe:start", "vibe:start loop":
				go triggerLoop(ctx, ctrl, cmd, "start")
			case "loop:next", "next", "next-step":
				go triggerLoop(ctx, ctrl, cmd, "next")
			case "loop:full-transpiler", "full-transpiler", "transpiler":
				go triggerLoop(ctx, ctrl, cmd, "full-transpiler")
			case "loop:status", "status":
				go sendStatusViaRemote(ctx, ctrl, cmd)
			case "loop:update", "update", "vibe:update":
				go triggerUpdate(ctx, ctrl, cmd)
			case "loop:pause", "pause":
				setStatus("paused")
				_ = ctrl.Ack(ctx, cmd.ID, "completed", map[string]any{"action": "paused"}, "loop paused")
			case "loop:resume", "resume":
				setStatus("idle")
				_ = ctrl.Ack(ctx, cmd.ID, "completed", map[string]any{"action": "resumed"}, "loop resumed")
			default:
				// Fall back to the standard processor for infra etc.
				if err := ctrl.ProcessCommand(ctx, cmd); err != nil {
					appendLog("process error: " + err.Error())
				}
			}
		}
		ctrl.StartPoller(ctx, *pollInterval, handler)
		appendLog("remote poller active (interval " + pollInterval.String() + ")")
	}

	// Emit initial heartbeat (then only on activity)
	emitHeartbeat(ctx, ctrl, "startup")

	// Block forever (idle)
	<-ctx.Done()
	appendLog("daemon shutdown requested")
	_ = srv.Shutdown(context.Background())
	return ctx.Err()
}

func normalizeCommand(c string) string {
	c = strings.ToLower(strings.TrimSpace(c))
	c = strings.ReplaceAll(c, " ", "-")
	return c
}

func handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "GET only", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(snapshotState())
}

func handleLogs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"logs": getRing()})
}

func handleControl(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var req controlRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, 400, "bad json")
		return
	}
	cmd := normalizeCommand(req.Command)
	appendLog("local control: " + cmd)

	switch cmd {
	case "loop:start", "start", "start-loop":
		go runLoopIteration(context.Background(), "start", req.Payload)
		writeJSON(w, map[string]any{"success": true, "message": "loop start triggered"})
	case "loop:next", "next":
		go runLoopIteration(context.Background(), "next", req.Payload)
		writeJSON(w, map[string]any{"success": true, "message": "next step triggered"})
	case "loop:full-transpiler", "full-transpiler":
		go runLoopIteration(context.Background(), "full-transpiler", req.Payload)
		writeJSON(w, map[string]any{"success": true, "message": "full transpiler triggered"})
	case "loop:status", "status":
		s := snapshotState()
		writeJSON(w, map[string]any{"success": true, "state": s})
	case "loop:update", "update":
		go func() {
			_, _, _ = doGitPullAndMaybeRestart(context.Background())
		}()
		writeJSON(w, map[string]any{"success": true, "message": "update triggered (git pull + restart if needed)"})
	case "pause":
		setStatus("paused")
		writeJSON(w, map[string]any{"success": true})
	case "resume":
		setStatus("idle")
		writeJSON(w, map[string]any{"success": true})
	default:
		writeJSONError(w, 400, "unknown command: "+req.Command)
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func writeJSONError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func triggerLoop(ctx context.Context, ctrl *agent.RemoteControl, cmd remote.AgentCommand, mode string) {
	setStatus("running")
	setWork(mode)
	state.mu.Lock()
	state.LastTrigger = time.Now()
	state.mu.Unlock()

	var p map[string]any
	_ = json.Unmarshal(cmd.Payload, &p)
	result, err := runLoopIteration(ctx, mode, p)
	if ctrl != nil {
		status := "completed"
		if err != nil {
			status = "failed"
		}
		_ = ctrl.Ack(ctx, cmd.ID, status, result, fmt.Sprintf("loop %s done", mode))
	}
	setStatus("idle")
	setWork("")
	emitHeartbeat(ctx, ctrl, "loop-"+mode+"-done")
}

func sendStatusViaRemote(ctx context.Context, ctrl *agent.RemoteControl, cmd remote.AgentCommand) {
	s := snapshotState()
	if ctrl != nil {
		_ = ctrl.Ack(ctx, cmd.ID, "completed", s, "daemon status")
	}
}

func triggerUpdate(ctx context.Context, ctrl *agent.RemoteControl, cmd remote.AgentCommand) {
	setStatus("updating")
	out, changed, err := doGitPullAndMaybeRestart(ctx)
	res := map[string]any{"output": out, "changed": changed}
	if err != nil {
		res["error"] = err.Error()
	}
	if ctrl != nil {
		_ = ctrl.Ack(ctx, cmd.ID, "completed", res, "update processed")
	}
	setStatus("idle")
}

func runLoopIteration(ctx context.Context, mode string, payload map[string]any) (map[string]any, error) {
	workMu.Lock()
	if workRunning {
		workMu.Unlock()
		return map[string]any{"skipped": true, "reason": "already running"}, nil
	}
	workRunning = true
	workMu.Unlock()
	defer func() {
		workMu.Lock()
		workRunning = false
		workMu.Unlock()
	}()

	appendLog("=== LOOP ITERATION START mode=" + mode + " ===")
	setStatus("running")
	setWork(mode)

	start := time.Now()
	var steps []string

	// 1. Ensure we are up to date (non-destructive)
	if out, err := runCmd(ctx, "git", "pull", "--ff-only"); err == nil {
		steps = append(steps, "git-pull: "+strings.TrimSpace(out))
		appendLog("git pull: " + truncate(out, 200))
	} else {
		appendLog("git pull note: " + err.Error())
	}

	// 2. Self plan (core of vibe self-build)
	if out, err := runPnpm(ctx, "self:plan"); err == nil {
		steps = append(steps, "self:plan ok")
		appendLog("self:plan completed")
	} else {
		appendLog("self:plan error: " + err.Error())
		steps = append(steps, "self:plan: "+truncate(out, 300))
	}

	// 3. Mode-specific action
	switch mode {
	case "full-transpiler", "transpiler":
		if out, err := runNode(ctx, "tools/vibe-compile/full-transpiler.js"); err == nil {
			steps = append(steps, "full-transpiler ok")
			appendLog("full-transpiler done")
		} else {
			appendLog("full-transpiler: " + err.Error())
			steps = append(steps, "transpiler: "+truncate(out, 300))
		}
	case "next":
		// Allow payload.instruction or default "continue self-build"
		instr := "continue the self-build / Grok build loop (next meaningful step)"
		if payload != nil {
			if v, ok := payload["instruction"].(string); ok && v != "" {
				instr = v
			}
			if v, ok := payload["arg"].(string); ok && v != "" {
				instr = v
			}
		}
		appendLog("next instruction: " + instr)
		// Execute kick + echo the instruction into a simple step file for visibility
		if out, err := runPnpm(ctx, "grok-build"); err == nil {
			steps = append(steps, "grok-build: " + truncate(out, 120))
		}
		_ = os.WriteFile("vibe-loop-next.txt", []byte(fmt.Sprintf("%s\n%s\n", time.Now().Format(time.RFC3339), instr)), 0o644)
		steps = append(steps, "next-instruction recorded")
	default:
		// Default start/continue: run grok-build stub + a continue report
		if out, err := runPnpm(ctx, "grok-build"); err == nil {
			steps = append(steps, "grok-build: "+truncate(out, 120))
		}
		if out, _ := runCmd(ctx, "go", "run", "./cmd/vibe", "continue", "--json"); out != "" {
			steps = append(steps, "continue-captured")
		}
	}

	dur := time.Since(start).Truncate(time.Second)
	appendLog(fmt.Sprintf("=== LOOP ITERATION COMPLETE in %s ===", dur))
	setStatus("idle")
	setWork("")

	res := map[string]any{
		"mode":     mode,
		"duration": dur.String(),
		"steps":    steps,
		"git":      getGitHead(ctx),
	}
	return res, nil
}

func doGitPullAndMaybeRestart(ctx context.Context) (string, bool, error) {
	appendLog("UPDATE: git pull --ff-only")
	out, err := runCmd(ctx, "git", "pull", "--ff-only")
	changed := false
	if err == nil && !strings.Contains(out, "Already up to date") && !strings.Contains(out, "up to date") {
		changed = true
	}
	appendLog("git pull result: " + truncate(out, 160))

	state.mu.Lock()
	state.LastUpdate = time.Now()
	if h := getGitHead(ctx); h != "" {
		state.GitHead = h
	}
	state.mu.Unlock()

	if changed {
		appendLog("CODE CHANGED — graceful self restart")
		// Spawn replacement process
		exe, _ := os.Executable()
		if exe == "" {
			exe = "vibe"
			if runtime.GOOS == "windows" {
				exe = "vibe.exe"
			}
		}
		newProc := exec.Command(exe, os.Args[1:]...)
		newProc.Dir = getRepoRoot()
		newProc.Stdout = os.Stdout
		newProc.Stderr = os.Stderr
		if err := newProc.Start(); err != nil {
			appendLog("restart spawn failed: " + err.Error())
			return out, changed, err
		}
		appendLog("restarted new pid=" + fmt.Sprint(newProc.Process.Pid))
		// Exit this one so Task Scheduler / wrapper sees clean stop
		go func() {
			time.Sleep(300 * time.Millisecond)
			os.Exit(0)
		}()
	}
	return out, changed, nil
}

func runCmd(ctx context.Context, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = getRepoRoot()
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	err := cmd.Run()
	return buf.String(), err
}

func runPnpm(ctx context.Context, script string) (string, error) {
	return runCmd(ctx, "pnpm", "run", script)
}

func runNode(ctx context.Context, script string) (string, error) {
	return runCmd(ctx, "node", script)
}

func getGitHead(ctx context.Context) string {
	out, err := runCmd(ctx, "git", "rev-parse", "--short", "HEAD")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(out)
}

func getRepoRoot() string {
	// Walk up similar to main.go
	cwd, _ := os.Getwd()
	for dir := cwd; ; dir = filepath.Dir(dir) {
		if _, err := os.Stat(filepath.Join(dir, "pnpm-workspace.yaml")); err == nil {
			return dir
		}
		if _, err := os.Stat(filepath.Join(dir, "go", "go.mod")); err == nil {
			return dir
		}
		if dir == filepath.Dir(dir) {
			break
		}
	}
	return cwd
}

func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func emitHeartbeat(ctx context.Context, ctrl *agent.RemoteControl, reason string) {
	if ctrl == nil {
		return
	}
	s := snapshotState()
	_ = ctrl.EmitTelemetry(ctx, "daemon_heartbeat", "daemon", map[string]any{
		"reason":  reason,
		"status":  s.Status,
		"work":    s.CurrentWork,
		"git":     s.GitHead,
		"pid":     s.PID,
	})
}

func getLastLines(path string, n int) []string {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	var lines []string
	for sc.Scan() {
		lines = append(lines, sc.Text())
		if len(lines) > n*2 {
			lines = lines[len(lines)-n:]
		}
	}
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return lines
}

// Small helper to make compile clean if remote pkg types used directly.
func _unused() { var _ io.Reader = nil }