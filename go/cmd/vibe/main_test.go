package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunHandoffAcceptsSelfPlan(t *testing.T) {
	planPath := filepath.Join(t.TempDir(), "self-plan.json")
	outDir := filepath.Join(t.TempDir(), "handoffs")
	raw := []byte(`{
	  "name": "vibe-self",
	  "source": "examples/vibe-self.vibe",
	  "repo": "C:/vibe",
	  "lanes": [
	    {
	      "name": "local_toolkit_lane",
	      "target": "surface.codex.local",
	      "owns": "docs/local-toolkit.md go/** packages/**",
	      "verify": ["pnpm run self:plan"],
	      "approval": "human.before_commit"
	    }
	  ]
	}`)
	if err := os.WriteFile(planPath, raw, 0o644); err != nil {
		t.Fatalf("write self-plan fixture: %v", err)
	}

	if err := runHandoff(context.Background(), []string{"--self-plan", planPath, "--out", outDir}); err != nil {
		t.Fatalf("runHandoff returned error: %v", err)
	}

	handoffPath := filepath.Join(outDir, "local_toolkit_lane.md")
	handoff, err := os.ReadFile(handoffPath)
	if err != nil {
		t.Fatalf("read exported handoff: %v", err)
	}
	if !strings.Contains(string(handoff), "# Vibe Lane Handoff: local_toolkit_lane") {
		t.Fatalf("unexpected exported handoff:\n%s", string(handoff))
	}
}
