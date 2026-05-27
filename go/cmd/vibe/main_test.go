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

// captureStdout redirects os.Stdout for the duration of fn and returns what was written.
func captureStdout(t *testing.T, fn func() error) (string, error) {
	t.Helper()
	old := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}
	os.Stdout = w
	runErr := fn()
	_ = w.Close()
	os.Stdout = old
	out, _ := io.ReadAll(r)
	return string(out), runErr
}

func TestRunHandoffAcceptsSelfPlan(t *testing.T) {
	outDir := filepath.Join(t.TempDir(), "handoffs")
	planPath := repoFixture(t, "docs/examples/vibe-self-plan.json")

	if err := runHandoff(context.Background(), []string{"--self-plan", planPath, "--out", outDir}); err != nil {
		t.Fatalf("runHandoff returned error: %v", err)
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
	if err := runHandoff(context.Background(), []string{"--plan", planPath, "--out", outDir}); err != nil {
		t.Fatalf("runHandoff --plan returned error: %v", err)
	}
	entries, err := os.ReadDir(outDir)
	if err != nil || len(entries) == 0 {
		t.Fatalf("expected handoff files in %s (err=%v)", outDir, err)
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
