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

// TestRunEmitWritesLaneHandoffs is the cmd/vibe-coord smoke test, mirroring
// cmd/vibe's TestRunHandoffAcceptsLanePlan. The emit subcommand routes through
// lanes.ParsePlan + lanes.EmitHandoffs (both covered in internal/lanes); this
// closes the seam by exercising vibe-coord's own flag parsing, plan read, and
// manifest output end to end.
func TestRunEmitWritesLaneHandoffs(t *testing.T) {
	outDir := filepath.Join(t.TempDir(), "handoffs")
	planPath := repoFixture(t, "docs/examples/pawfall-feedback-lanes.json")

	out, err := captureStdout(t, func() error {
		return runEmit(context.Background(), []string{"--plan", planPath, "--out", outDir})
	})
	if err != nil {
		t.Fatalf("runEmit returned error: %v", err)
	}

	// The pawfall fixture declares two lanes; their names sanitize directly to
	// these filenames. Each mode renders a different handoff template, so assert
	// each lane's real header (identical to the EmitHandoffs output exercised by
	// cmd/vibe's TestRunHandoffAcceptsLanePlan).
	cases := []struct {
		lane, header string
	}{
		{"feedback-triage", "# Codex Web Handoff: feedback-triage"},
		{"unity-runtime-local", "# Local Lane Checklist: unity-runtime-local"},
	}
	for _, tc := range cases {
		if !strings.Contains(out, tc.lane) {
			t.Fatalf("emit manifest missing lane %q:\n%s", tc.lane, out)
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
