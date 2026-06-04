package agent

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/lutherfourie/vibe/go/internal/remote"
)

func TestProcessCommandEmitsTelemetryBeforePauseWaitsForResume(t *testing.T) {
	telemetry := make(chan map[string]any, 2)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPatch && r.URL.Path == "/rest/v1/agent_commands":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{}]`))
		case r.Method == http.MethodPost && r.URL.Path == "/rest/v1/agent_responses":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{}]`))
		case r.Method == http.MethodPost && r.URL.Path == "/rest/v1/agent_events":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{}]`))
		case r.Method == http.MethodGet && r.URL.Path == "/rest/v1/agent_commands":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[]`))
		case r.Method == http.MethodPost && r.URL.Path == "/rest/v1/telemetry_events":
			var event map[string]any
			if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
				t.Errorf("decode telemetry body: %v", err)
			}
			telemetry <- event
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{}]`))
		default:
			t.Errorf("unexpected request %s %s", r.Method, r.URL.String())
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()
	t.Setenv("SUPABASE_URL", server.URL)
	t.Setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	ctrl := NewRemoteControl(remote.NewClient(), "session-1")
	go func() {
		done <- ctrl.ProcessCommand(ctx, remote.AgentCommand{
			ID:        "cmd-1",
			SessionID: "session-1",
			Command:   "pause",
			IssuedBy:  "dashboard",
		})
	}()

	select {
	case event := <-telemetry:
		if got, want := event["kind"], "remote_command_processed"; got != want {
			t.Fatalf("telemetry kind = %v, want %s", got, want)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timed out waiting for pause command telemetry")
	}

	cancel()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("pause command did not stop after context cancellation")
	}
}

// --- Additional tests from parallel codex for remote C&C handlers (checkpoint via vibe bin, pause/resume/launch) ---

type recordedRemoteRequest struct {
	Method string
	Path   string
	Body   map[string]any
}

type remoteRecorder struct {
	mu              sync.Mutex
	requests        []recordedRemoteRequest
	pendingCommands []remote.AgentCommand
}

func newRemoteHarness(t *testing.T, sessionID string, pending []remote.AgentCommand) (*RemoteControl, *remoteRecorder) {
	t.Helper()

	rec := &remoteRecorder{pendingCommands: pending}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		req := recordedRemoteRequest{Method: r.Method, Path: r.URL.Path}
		if r.Body != nil {
			defer r.Body.Close()
			_ = json.NewDecoder(r.Body).Decode(&req.Body)
		}
		rec.mu.Lock()
		rec.requests = append(rec.requests, req)
		rec.mu.Unlock()

		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet && r.URL.Path == "/rest/v1/agent_commands" {
			_ = json.NewEncoder(w).Encode(rec.pendingCommands)
			return
		}
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`[]`))
	}))
	t.Cleanup(srv.Close)

	t.Setenv("SUPABASE_URL", srv.URL)
	t.Setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
	return NewRemoteControl(remote.NewClient(), sessionID), rec
}

func (r *remoteRecorder) postBodies(table string) []map[string]any {
	r.mu.Lock()
	defer r.mu.Unlock()

	path := "/rest/v1/" + table
	var bodies []map[string]any
	for _, req := range r.requests {
		if req.Method == http.MethodPost && req.Path == path {
			bodies = append(bodies, req.Body)
		}
	}
	return bodies
}

func (r *remoteRecorder) hasEventKind(kind string) bool {
	for _, body := range r.postBodies("agent_events") {
		if body["kind"] == kind {
			return true
		}
	}
	return false
}

func (r *remoteRecorder) telemetryFor(command string) bool {
	for _, body := range r.postBodies("telemetry_events") {
		if body["kind"] != "remote_command_processed" || body["source"] != "go" {
			continue
		}
		payload, ok := body["payload"].(map[string]any)
		if ok && payload["command"] == command {
			return true
		}
	}
	return false
}

func TestProcessCommandCheckpointRunsVibeCheckpointAndEmitsTelemetry(t *testing.T) {
	logPath := installFakeGo(t)
	ctrl, rec := newRemoteHarness(t, "session-1", nil)

	err := ctrl.ProcessCommand(context.Background(), remote.AgentCommand{
		ID:        "cmd-checkpoint",
		SessionID: "session-1",
		Command:   "checkpoint",
		IssuedBy:  "operator",
	})
	if err != nil {
		t.Fatalf("ProcessCommand(checkpoint): %v", err)
	}

	rawLog, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("checkpoint command did not execute fake go: %v", err)
	}
	log := string(rawLog)
	for _, want := range []string{"run", "./cmd/vibe", "checkpoint", "--summary", "remote via operator", "--note", "from command", "--status", "in_progress"} {
		if !strings.Contains(log, want) {
			t.Fatalf("checkpoint command missing %q in fake go log:\n%s", want, log)
		}
	}

	responses := rec.postBodies("agent_responses")
	if len(responses) != 1 {
		t.Fatalf("expected one response, got %d", len(responses))
	}
	result, ok := responses[0]["result"].(map[string]any)
	if !ok {
		t.Fatalf("response result should be object, got %#v", responses[0]["result"])
	}
	if result["output"] != "checkpoint-output" {
		t.Fatalf("checkpoint output not captured in result: %#v", result)
	}
	if !rec.hasEventKind("checkpoint_completed") {
		t.Fatalf("checkpoint_completed event not emitted; events=%#v", rec.postBodies("agent_events"))
	}
	if !rec.telemetryFor("checkpoint") {
		t.Fatalf("remote command telemetry not emitted; telemetry=%#v", rec.postBodies("telemetry_events"))
	}
}

func TestProcessCommandControlCommandsEmitEventsAndTelemetry(t *testing.T) {
	tests := []struct {
		name      string
		command   string
		eventKind string
		pending   []remote.AgentCommand
	}{
		{name: "pause", command: "pause", eventKind: "agent_paused", pending: []remote.AgentCommand{{
			ID:        "cmd-resume-pending",
			SessionID: "session-1",
			Command:   "resume",
			Status:    "pending",
		}}},
		{name: "resume", command: "resume", eventKind: "agent_resumed"},
		{name: "launch", command: "launch", eventKind: "launch_queued"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctrl, rec := newRemoteHarness(t, "session-1", tt.pending)

			err := ctrl.ProcessCommand(context.Background(), remote.AgentCommand{
				ID:        "cmd-" + tt.command,
				SessionID: "session-1",
				Command:   tt.command,
				IssuedBy:  "operator",
			})
			if err != nil {
				t.Fatalf("ProcessCommand(%s): %v", tt.command, err)
			}

			if !rec.hasEventKind(tt.eventKind) {
				t.Fatalf("%s event not emitted; events=%#v", tt.eventKind, rec.postBodies("agent_events"))
			}
			if !rec.telemetryFor(tt.command) {
				t.Fatalf("%s telemetry not emitted; telemetry=%#v", tt.command, rec.postBodies("telemetry_events"))
			}
		})
	}
}

func installFakeGo(t *testing.T) string {
	t.Helper()

	dir := t.TempDir()
	logPath := filepath.Join(dir, "go-invocation.log")
	var scriptPath, script string
	if runtime.GOOS == "windows" {
		scriptPath = filepath.Join(dir, "go.cmd")
		script = "@echo off\r\n" +
			"echo %CD%>\"%VIBE_FAKE_GO_LOG%\"\r\n" +
			"echo %*>>\"%VIBE_FAKE_GO_LOG%\"\r\n" +
			"echo checkpoint-output\r\n" +
			"exit /b 0\r\n"
	} else {
		scriptPath = filepath.Join(dir, "go")
		script = "#!/bin/sh\n" +
			"printf '%s\\n' \"$PWD\" > \"$VIBE_FAKE_GO_LOG\"\n" +
			"printf '%s\\n' \"$*\" >> \"$VIBE_FAKE_GO_LOG\"\n" +
			"printf '%s\\n' checkpoint-output\n"
	}
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake go: %v", err)
	}

	t.Setenv("VIBE_FAKE_GO_LOG", logPath)
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
	return logPath
}
