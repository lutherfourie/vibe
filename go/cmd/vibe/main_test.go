package main

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// repoFixture resolves a path relative to the repo root so tests can use the
// committed (schema-valid) example plans.
func repoFixture(t *testing.T, rel string) string {
	t.Helper()
	abs, err := filepath.Abs(filepath.Join("..", "..", "..", rel))
	if err != nil {
		t.Fatalf("resolve fixture %s: %v", rel, err)
	}
	if _, err := os.Stat(abs); err != nil {
		t.Fatalf("fixture not found %s: %v", abs, err)
	}
	return abs
}

// captureStdout redirects os.Stdout for the duration of fn and returns what was
// written. The read end is drained concurrently so fn may write more than the OS
// pipe buffer without deadlocking. Because it mutates the process-global
// os.Stdout, tests that use this helper must NOT call t.Parallel().
func captureStdout(t *testing.T, fn func() error) (string, error) {
	t.Helper()
	old := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}
	os.Stdout = w

	done := make(chan string, 1)
	go func() {
		out, _ := io.ReadAll(r)
		done <- string(out)
	}()

	runErr := fn()
	_ = w.Close()
	os.Stdout = old
	return <-done, runErr
}

func TestRunHandoffAcceptsSelfPlan(t *testing.T) {
	outDir := filepath.Join(t.TempDir(), "handoffs")
	planPath := repoFixture(t, "docs/examples/vibe-self-plan.json")

	out, err := captureStdout(t, func() error {
		return runHandoff(context.Background(), []string{"--self-plan", planPath, "--out", outDir})
	})
	if err != nil {
		t.Fatalf("runHandoff returned error: %v", err)
	}
	for _, want := range []string{"self-plan", "local_toolkit_lane"} {
		if !strings.Contains(out, want) {
			t.Fatalf("handoff manifest missing %q:\n%s", want, out)
		}
	}

	handoff, err := os.ReadFile(filepath.Join(outDir, "local_toolkit_lane.md"))
	if err != nil {
		t.Fatalf("read exported handoff: %v", err)
	}
	if !strings.Contains(string(handoff), "# Vibe Lane Handoff: local_toolkit_lane") {
		t.Fatalf("unexpected exported handoff:\n%s", string(handoff))
	}
}

func TestRunLanesPrintsLaneTable(t *testing.T) {
	planPath := repoFixture(t, "docs/examples/vibe-self-plan.json")
	out, err := captureStdout(t, func() error {
		return runLanes([]string{"--plan", planPath})
	})
	if err != nil {
		t.Fatalf("runLanes returned error: %v", err)
	}
	for _, want := range []string{"vibe-self", "LANE", "local_toolkit_lane"} {
		if !strings.Contains(out, want) {
			t.Fatalf("lanes output missing %q:\n%s", want, out)
		}
	}
}

func TestRunGraphWritesMermaid(t *testing.T) {
	planPath := repoFixture(t, "docs/examples/vibe-self-plan.json")
	outPath := filepath.Join(t.TempDir(), "lanes.mmd")
	if err := runGraph([]string{"--plan", planPath, "--out", outPath}); err != nil {
		t.Fatalf("runGraph returned error: %v", err)
	}
	graph, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("read mermaid: %v", err)
	}
	if !strings.Contains(string(graph), "flowchart LR") {
		t.Fatalf("unexpected mermaid output:\n%s", string(graph))
	}
}

func TestRunHandoffAcceptsLanePlan(t *testing.T) {
	outDir := filepath.Join(t.TempDir(), "handoffs")
	planPath := repoFixture(t, "docs/examples/pawfall-feedback-lanes.json")
	out, err := captureStdout(t, func() error {
		return runHandoff(context.Background(), []string{"--plan", planPath, "--out", outDir})
	})
	if err != nil {
		t.Fatalf("runHandoff --plan returned error: %v", err)
	}

	// The pawfall fixture declares two lanes; their names sanitize directly to
	// these filenames (the sanitizer maps non-alphanumerics to "-"). Each mode
	// renders a different handoff template, so assert each lane's real header.
	cases := []struct {
		lane, header string
	}{
		{"feedback-triage", "# Codex Web Handoff: feedback-triage"},
		{"unity-runtime-local", "# Local Lane Checklist: unity-runtime-local"},
	}
	for _, tc := range cases {
		if !strings.Contains(out, tc.lane) {
			t.Fatalf("handoff manifest missing lane %q:\n%s", tc.lane, out)
		}
		body, err := os.ReadFile(filepath.Join(outDir, tc.lane+".md"))
		if err != nil {
			t.Fatalf("read %s.md: %v", tc.lane, err)
		}
		if !strings.Contains(string(body), tc.header) {
			t.Fatalf("unexpected handoff for %s:\n%s", tc.lane, string(body))
		}
	}
}

func TestRunHandoffEmitsAutonomousLane(t *testing.T) {
	outDir := filepath.Join(t.TempDir(), "handoffs")
	planPath := repoFixture(t, "docs/examples/vibe-autonomous-lanes.json")
	out, err := captureStdout(t, func() error {
		return runHandoff(context.Background(), []string{"--plan", planPath, "--out", outDir})
	})
	if err != nil {
		t.Fatalf("runHandoff --plan returned error: %v", err)
	}

	// The autonomous fixture declares one autonomous lane and one local lane;
	// each mode renders a different template, so assert the autonomous header
	// (and the embedded operating contract) for the autonomous lane.
	if !strings.Contains(out, "agent-sdk-hardening") {
		t.Fatalf("handoff manifest missing the autonomous lane:\n%s", out)
	}
	body, err := os.ReadFile(filepath.Join(outDir, "agent-sdk-hardening.md"))
	if err != nil {
		t.Fatalf("read agent-sdk-hardening.md: %v", err)
	}
	for _, want := range []string{
		"# Autonomous Lane: agent-sdk-hardening",
		"Mode: autonomous",
		"## Autonomous Operating Contract",
		"### Structured Workflow Loop",
		"### PROGRESS.md Contract",
	} {
		if !strings.Contains(string(body), want) {
			t.Fatalf("autonomous handoff missing %q:\n%s", want, string(body))
		}
	}
}

func TestRunCheckpointCreatesThenAppends(t *testing.T) {
	target := filepath.Join(t.TempDir(), "PROGRESS.md")

	out1, err := captureStdout(t, func() error {
		return runCheckpoint([]string{
			"--progress", target, "--summary", "first", "--note", "did A",
			"--date", "2026-06-03", "--status", "started",
		})
	})
	if err != nil {
		t.Fatalf("first checkpoint: %v", err)
	}
	if !strings.Contains(out1, target) {
		t.Fatalf("checkpoint did not print the path: %q", out1)
	}
	body, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("read created PROGRESS.md: %v", err)
	}
	for _, want := range []string{"Status: started", "Updated: 2026-06-03", "### 2026-06-03 — first", "- did A"} {
		if !strings.Contains(string(body), want) {
			t.Fatalf("created PROGRESS.md missing %q:\n%s", want, string(body))
		}
	}

	if _, err := captureStdout(t, func() error {
		return runCheckpoint([]string{"--progress", target, "--summary", "second", "--date", "2026-06-04"})
	}); err != nil {
		t.Fatalf("second checkpoint: %v", err)
	}
	body2, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("re-read PROGRESS.md: %v", err)
	}
	s := string(body2)
	if !strings.Contains(s, "Updated: 2026-06-04") {
		t.Errorf("Updated not refreshed on append:\n%s", s)
	}
	// Newest entry must precede the older one in the file (head-of-log insert).
	if strings.Index(s, "### 2026-06-04 — second") > strings.Index(s, "### 2026-06-03 — first") {
		t.Errorf("second checkpoint should be inserted at the head of the log:\n%s", s)
	}
}

func TestRunResumePrintsBrief(t *testing.T) {
	target := filepath.Join(t.TempDir(), "PROGRESS.md")
	if _, err := captureStdout(t, func() error {
		return runCheckpoint([]string{
			"--progress", target, "--summary", "seed", "--note", "n1",
			"--date", "2026-06-03", "--status", "going",
		})
	}); err != nil {
		t.Fatalf("seed checkpoint: %v", err)
	}

	out, err := captureStdout(t, func() error {
		return runResume(context.Background(), []string{"--progress", target})
	})
	if err != nil {
		t.Fatalf("resume: %v", err)
	}
	for _, want := range []string{"# Resume:", "Status: going", "## Latest Checkpoint", "### 2026-06-03 — seed", "- n1"} {
		if !strings.Contains(out, want) {
			t.Fatalf("resume brief missing %q:\n%s", want, out)
		}
	}
}

func TestRunCheckpointRequiresSummary(t *testing.T) {
	target := filepath.Join(t.TempDir(), "PROGRESS.md")
	err := runCheckpoint([]string{"--progress", target})
	if err == nil {
		t.Fatal("expected an error when --summary is omitted")
	}
	if _, statErr := os.Stat(target); statErr == nil {
		t.Fatal("no PROGRESS.md should be written when --summary is missing")
	}
}

func TestRunMakePlanWritesJSON(t *testing.T) {
	outPath := filepath.Join(t.TempDir(), "self-plan.json")
	out, err := captureStdout(t, func() error {
		return runMakePlan(context.Background(), []string{"--repo", ".", "--out", outPath})
	})
	if err != nil {
		t.Fatalf("runMakePlan returned error: %v", err)
	}
	if !strings.Contains(out, outPath) {
		t.Fatalf("make-plan did not print output path: %q", out)
	}
	raw, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("read generated plan: %v", err)
	}
	if !strings.Contains(string(raw), "\"lanes\"") {
		t.Fatalf("generated plan missing lanes:\n%s", string(raw))
	}
}

func TestRunIacCompileWritesArtifacts(t *testing.T) {
	outDir := filepath.Join(t.TempDir(), "crewai-out")
	src := repoFixture(t, "examples/08-agent.vibe")

	out, err := captureStdout(t, func() error {
		return runIacCompile([]string{"--source", src, "--backend", "crewai", "--out", outDir})
	})
	if err != nil {
		t.Fatalf("runIacCompile returned error: %v", err)
	}
	if !strings.Contains(out, "wrote CrewAI IaC artifacts") {
		t.Fatalf("iac-compile output missing success message:\n%s", out)
	}

	crew, err := os.ReadFile(filepath.Join(outDir, "crew.py"))
	if err != nil {
		t.Fatalf("read crew.py: %v", err)
	}
	crewS := string(crew)
	if !strings.Contains(crewS, "from crewai import") {
		t.Fatalf("crew.py missing 'from crewai import':\n%s", crewS)
	}
	if !strings.Contains(crewS, "Vibe IaC header") {
		t.Fatalf("crew.py missing Vibe IaC header:\n%s", crewS)
	}

	contract, err := os.ReadFile(filepath.Join(outDir, "vibe-contract.md"))
	if err != nil {
		t.Fatalf("read vibe-contract.md: %v", err)
	}
	if !strings.Contains(string(contract), "Vibe IaC") {
		t.Fatalf("vibe-contract.md missing contract header:\n%s", string(contract))
	}

	if _, err := os.Stat(filepath.Join(outDir, "manifest.json")); err != nil {
		t.Fatalf("manifest.json not written: %v", err)
	}
}
