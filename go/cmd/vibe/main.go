package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/lutherfourie/vibe/go/internal/bootstrap"
	"github.com/lutherfourie/vibe/go/internal/continuation"
	"github.com/lutherfourie/vibe/go/internal/doctor"
	"github.com/lutherfourie/vibe/go/internal/lanes"
	"github.com/lutherfourie/vibe/go/internal/progress"
	"github.com/lutherfourie/vibe/go/internal/selfplan"
	"github.com/lutherfourie/vibe/go/internal/serve"
)

const (
	defaultSelfPlan = "docs/examples/vibe-self-plan.json"
	defaultGraphOut = "docs/examples/vibe-lanes.mmd"
)

func main() {
	if err := run(context.Background(), os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "vibe:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string) error {
	if len(args) == 0 {
		usage(os.Stdout)
		return nil
	}

	switch args[0] {
	case "doctor":
		return runDoctor(ctx, args[1:])
	case "continue":
		return runContinue(ctx, args[1:])
	case "lanes":
		return runLanes(args[1:])
	case "graph":
		return runGraph(args[1:])
	case "serve":
		return runServe(args[1:])
	case "verify":
		return runVerify(ctx, args[1:])
	case "make-plan":
		return runMakePlan(ctx, args[1:])
	case "handoff":
		return runHandoff(ctx, args[1:])
	case "checkpoint":
		return runCheckpoint(args[1:])
	case "resume":
		return runResume(ctx, args[1:])
	case "help", "-h", "--help":
		usage(os.Stdout)
		return nil
	default:
		return fmt.Errorf("unknown subcommand %q", args[0])
	}
}

func usage(out *os.File) {
	fmt.Fprintln(out, "Usage: vibe <command> [options]")
	fmt.Fprintln(out)
	fmt.Fprintln(out, "Commands:")
	fmt.Fprintln(out, "  continue    Print the compact repo resume protocol")
	fmt.Fprintln(out, "  doctor      Check local tool prerequisites")
	fmt.Fprintln(out, "  lanes       Print self-plan lanes")
	fmt.Fprintln(out, "  graph       Generate a Mermaid lane graph")
	fmt.Fprintln(out, "  serve       Host the local Vibe admin dashboard and turn API")
	fmt.Fprintln(out, "  verify      Run the repo verification command")
	fmt.Fprintln(out, "  make-plan   Emit the bootstrap lane plan JSON")
	fmt.Fprintln(out, "  handoff     Emit markdown handoffs from a lane-plan or self-plan JSON")
	fmt.Fprintln(out, "  checkpoint  Append a timestamped checkpoint to PROGRESS.md")
	fmt.Fprintln(out, "  resume      Print a resume brief from PROGRESS.md + live git state")
}

func runContinue(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("continue", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	planPath := flags.String("plan", defaultSelfPlan, "path to Vibe self-plan JSON")
	jsonOut := flags.Bool("json", false, "write machine-readable JSON")
	if err := flags.Parse(args); err != nil {
		return err
	}

	report := continuation.Report{
		RepoRoot:  repoRoot(),
		Branch:    strings.TrimSpace(gitOutput(ctx, "branch", "--show-current")),
		Upstream:  strings.TrimSpace(gitOutput(ctx, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")),
		ReadFirst: continuation.DefaultReadFirst(),
		Commands:  continuation.DefaultCommands(),
		NextMoves: continuation.DefaultNextMoves(),
	}

	status := gitOutput(ctx, "status", "--short")
	for _, line := range strings.Split(status, "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			report.ChangedPaths = append(report.ChangedPaths, line)
		}
	}
	report.Clean = len(report.ChangedPaths) == 0

	if plan, err := selfplan.Load(resolveRepoPath(*planPath)); err == nil {
		report.PlanName = plan.Name
		report.PlanSource = plan.Source
		report.LaneCount = len(plan.Lanes)
	}

	// Surface the durable PROGRESS.md state (lane-grain) inside the repo-grain
	// continue report so the orient command shows where long-horizon work stands.
	if raw, err := os.ReadFile(resolveRepoPath("PROGRESS.md")); err == nil {
		if doc, perr := progress.Parse(string(raw)); perr == nil {
			p := &continuation.Progress{Status: doc.Status, Updated: doc.Updated}
			if len(doc.Checkpoints) > 0 {
				latest := strings.TrimSpace(doc.Checkpoints[0].Time)
				if s := strings.TrimSpace(doc.Checkpoints[0].Summary); s != "" {
					latest += " — " + s
				}
				p.LatestCheckpoint = latest
			}
			if p.Status != "" || p.LatestCheckpoint != "" {
				report.Progress = p
			}
		}
	}

	if *jsonOut {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(report)
	}

	fmt.Print(continuation.Markdown(report))
	return nil
}

func runDoctor(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("doctor", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	jsonOut := flags.Bool("json", false, "write machine-readable JSON")
	if err := flags.Parse(args); err != nil {
		return err
	}

	report := doctor.Run(ctx, doctor.DefaultRequirements())
	if *jsonOut {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(report)
	}

	fmt.Print(doctor.Markdown(report))
	if !report.OK {
		return fmt.Errorf("required checks failed")
	}
	return nil
}

func runLanes(args []string) error {
	flags := flag.NewFlagSet("lanes", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	planPath := flags.String("plan", defaultSelfPlan, "path to Vibe self-plan JSON")
	jsonOut := flags.Bool("json", false, "write machine-readable JSON")
	if err := flags.Parse(args); err != nil {
		return err
	}

	plan, err := selfplan.Load(resolveRepoPath(*planPath))
	if err != nil {
		return err
	}
	if *jsonOut {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(plan.Lanes)
	}

	printLaneTable(plan)
	return nil
}

func runGraph(args []string) error {
	flags := flag.NewFlagSet("graph", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	planPath := flags.String("plan", defaultSelfPlan, "path to Vibe self-plan JSON")
	outPath := flags.String("out", defaultGraphOut, "path for generated Mermaid graph")
	if err := flags.Parse(args); err != nil {
		return err
	}

	plan, err := selfplan.Load(resolveRepoPath(*planPath))
	if err != nil {
		return err
	}
	resolvedOut := resolveRepoPathForWrite(*outPath)
	if err := selfplan.WriteMermaid(plan, resolvedOut); err != nil {
		return err
	}
	fmt.Println(resolvedOut)
	return nil
}

func runServe(args []string) error {
	flags := flag.NewFlagSet("serve", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	planPath := flags.String("plan", defaultSelfPlan, "path to Vibe self-plan JSON")
	addr := flags.String("addr", serve.DefaultAddr, "local address to bind")
	provider := flags.String("provider", serve.DefaultProvider, "agent provider for /v1/turn (fake or claude)")
	if err := flags.Parse(args); err != nil {
		return err
	}

	plan, err := selfplan.Load(resolveRepoPath(*planPath))
	if err != nil {
		return err
	}
	graph := selfplan.Mermaid(plan)
	rawPlan, err := json.MarshalIndent(plan, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal self-plan: %w", err)
	}
	rawPlan = append(rawPlan, '\n')

	daemon, err := serve.NewDaemon(serve.Options{DefaultProvider: *provider})
	if err != nil {
		return err
	}

	mux := http.NewServeMux()
	daemon.Register(mux)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, selfplan.DashboardHTML(plan, graph))
	})
	mux.HandleFunc("/self-plan.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write(rawPlan)
	})
	mux.HandleFunc("/vibe-lanes.mmd", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		fmt.Fprint(w, graph)
	})
	mux.HandleFunc("/handoffs/", func(w http.ResponseWriter, r *http.Request) {
		filename := strings.TrimPrefix(r.URL.Path, "/handoffs/")
		for _, lane := range plan.Lanes {
			if filename != selfplan.HandoffFilename(lane) {
				continue
			}
			w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
			w.Header().Set("Content-Disposition", "attachment; filename="+strconv.Quote(filename))
			fmt.Fprint(w, selfplan.LaneHandoff(plan, lane))
			return
		}
		http.NotFound(w, r)
	})
	mux.HandleFunc("/favicon.ico", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	log.Printf("Vibe admin dashboard and turn API listening on http://%s", *addr)
	return http.ListenAndServe(*addr, mux)
}

func runVerify(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("verify", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	command := flags.String("command", "pnpm run check", "verification command to run from repo root")
	if err := flags.Parse(args); err != nil {
		return err
	}

	parts := strings.Fields(*command)
	if len(parts) == 0 {
		return fmt.Errorf("--command cannot be empty")
	}
	cmd := exec.CommandContext(ctx, parts[0], parts[1:]...)
	cmd.Dir = repoRoot()
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	return cmd.Run()
}

func runMakePlan(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("make-plan", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	repo := flags.String("repo", ".", "repo root for the generated Vibe self-making plan")
	outPath := flags.String("out", "", "optional path to write JSON plan")
	if err := flags.Parse(args); err != nil {
		return err
	}

	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	plan := bootstrap.SelfMakingPlan(*repo)
	raw, err := json.MarshalIndent(plan, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal plan: %w", err)
	}
	raw = append(raw, '\n')

	if *outPath == "" {
		_, err := os.Stdout.Write(raw)
		return err
	}

	resolvedOut := resolveRepoPathForWrite(*outPath)
	dir := filepath.Dir(resolvedOut)
	if dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("create output directory: %w", err)
		}
	}
	if err := os.WriteFile(resolvedOut, raw, 0o644); err != nil {
		return fmt.Errorf("write plan: %w", err)
	}
	fmt.Println(resolvedOut)
	return nil
}

func runHandoff(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("handoff", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	planPath := flags.String("plan", "", "path to lane-plan JSON")
	selfPlanPath := flags.String("self-plan", "", "path to Vibe self-plan JSON")
	outDir := flags.String("out", ".vibe-out", "directory for generated handoffs")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if (*planPath == "") == (*selfPlanPath == "") {
		return fmt.Errorf("exactly one of --plan or --self-plan is required")
	}

	if *selfPlanPath != "" {
		plan, err := selfplan.Load(resolveRepoPath(*selfPlanPath))
		if err != nil {
			return err
		}
		exports, err := selfplan.WriteLaneHandoffs(plan, resolveRepoPathForWrite(*outDir))
		if err != nil {
			return err
		}
		for _, handoff := range exports {
			fmt.Printf("self-plan\t%s\t%s\n", handoff.LaneName, handoff.Path)
		}
		return nil
	}

	raw, err := os.ReadFile(resolveRepoPath(*planPath))
	if err != nil {
		return fmt.Errorf("read plan: %w", err)
	}

	plan, err := lanes.ParsePlan(raw)
	if err != nil {
		return err
	}

	result, err := lanes.EmitHandoffs(ctx, plan, resolveRepoPathForWrite(*outDir))
	if err != nil {
		return err
	}
	for _, handoff := range result.Handoffs {
		fmt.Printf("%s\t%s\t%s\n", handoff.Mode, handoff.LaneName, handoff.Path)
	}
	return nil
}

// stringSliceFlag collects a repeatable string flag (e.g. --note a --note b).
type stringSliceFlag []string

func (s *stringSliceFlag) String() string { return strings.Join(*s, ", ") }
func (s *stringSliceFlag) Set(v string) error {
	*s = append(*s, v)
	return nil
}

// runCheckpoint appends a timestamped checkpoint to PROGRESS.md (the durable
// state spine of a long-horizon lane), scaffolding the file if it is absent and
// preserving its existing shape otherwise.
func runCheckpoint(args []string) error {
	flags := flag.NewFlagSet("checkpoint", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	summary := flags.String("summary", "", "short checkpoint summary (required)")
	status := flags.String("status", "", "optional new front-block Status")
	progressPath := flags.String("progress", "PROGRESS.md", "path to the PROGRESS.md file")
	date := flags.String("date", "", "checkpoint stamp (default: today, YYYY-MM-DD)")
	var notes stringSliceFlag
	flags.Var(&notes, "note", "a checkpoint note (repeatable)")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*summary) == "" {
		return fmt.Errorf("--summary is required")
	}

	stamp := strings.TrimSpace(*date)
	if stamp == "" {
		stamp = time.Now().Format("2006-01-02")
	}

	target := resolveRepoPathForWrite(*progressPath)
	existing := ""
	if raw, err := os.ReadFile(target); err == nil {
		existing = string(raw)
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("read %s: %w", target, err)
	}

	updated, err := progress.AppendCheckpoint(existing, progress.Checkpoint{
		Time:    stamp,
		Summary: strings.TrimSpace(*summary),
		Notes:   notes,
	}, strings.TrimSpace(*status))
	if err != nil {
		return err
	}
	if err := os.WriteFile(target, []byte(updated), 0o644); err != nil {
		return fmt.Errorf("write %s: %w", target, err)
	}
	fmt.Println(target)
	return nil
}

// runResume prints a compact resume brief from PROGRESS.md combined with live git
// state — the lane-grain counterpart to `vibe continue` (which is repo-grain).
func runResume(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("resume", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	progressPath := flags.String("progress", "PROGRESS.md", "path to the PROGRESS.md file")
	if err := flags.Parse(args); err != nil {
		return err
	}

	target := resolveRepoPath(*progressPath)
	raw, err := os.ReadFile(target)
	if err != nil {
		return fmt.Errorf("read %s: %w (run `vibe checkpoint` to create it)", target, err)
	}
	doc, err := progress.Parse(string(raw))
	if err != nil {
		return err
	}

	liveBranch := strings.TrimSpace(gitOutput(ctx, "branch", "--show-current"))
	dirty := strings.TrimSpace(gitOutput(ctx, "status", "--short")) != ""

	fmt.Print(progress.ResumeBrief(doc, liveBranch, dirty))
	return nil
}

func printLaneTable(plan selfplan.Plan) {
	fmt.Printf("%s\n", plan.Name)
	fmt.Println("LANE\tTARGET\tVERIFY")
	for _, lane := range plan.Lanes {
		fmt.Printf("%s\t%s\t%s\n", lane.Name, lane.Target, strings.Join(lane.Verify, " && "))
	}
}

func resolveRepoPath(path string) string {
	if filepath.IsAbs(path) {
		return path
	}
	if _, err := os.Stat(path); err == nil {
		return path
	}
	repoPath := filepath.Join(repoRoot(), path)
	if _, err := os.Stat(repoPath); err == nil {
		return repoPath
	}
	return path
}

func resolveRepoPathForWrite(path string) string {
	if filepath.IsAbs(path) {
		return path
	}
	root := repoRoot()
	if root != "." {
		return filepath.Join(root, path)
	}
	return path
}

func gitOutput(ctx context.Context, args ...string) string {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = repoRoot()
	raw, err := cmd.Output()
	if err != nil {
		return ""
	}
	return string(raw)
}

func repoRoot() string {
	cwd, err := os.Getwd()
	if err != nil {
		return "."
	}
	for dir := cwd; ; dir = filepath.Dir(dir) {
		if _, err := os.Stat(filepath.Join(dir, "pnpm-workspace.yaml")); err == nil {
			return dir
		}
		if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
			if _, goModErr := os.Stat(filepath.Join(dir, "go", "go.mod")); goModErr == nil {
				return dir
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
	}
	return "."
}
