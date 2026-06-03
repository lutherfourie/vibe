package lanes

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidatePlanRejectsOverlappingWriteScopes(t *testing.T) {
	plan := Plan{
		Name: "test",
		Repo: "C:/Repo",
		Lanes: []Lane{
			{
				Name:   "docs",
				Mode:   ModeCodexWeb,
				Writes: []string{"docs/**"},
				Prompt: "write docs",
			},
			{
				Name:   "one-doc",
				Mode:   ModeLocal,
				Writes: []string{"docs/plan.md"},
				Prompt: "write one doc",
			},
		},
	}

	if err := ValidatePlan(plan); err == nil {
		t.Fatal("expected overlapping scopes to be rejected")
	}
}

func TestValidatePlanAllowsDisjointWriteScopes(t *testing.T) {
	plan := Plan{
		Name: "test",
		Repo: "C:/Repo",
		Lanes: []Lane{
			{
				Name:   "docs",
				Mode:   ModeCodexWeb,
				Writes: []string{"docs/**"},
				Prompt: "write docs",
			},
			{
				Name:   "runtime",
				Mode:   ModeLocal,
				Writes: []string{"src/**"},
				Prompt: "write runtime",
			},
		},
	}

	if err := ValidatePlan(plan); err != nil {
		t.Fatalf("expected disjoint scopes to pass: %v", err)
	}
}

func TestParsePlanRejectsBadMode(t *testing.T) {
	// Structurally complete lane-plan whose only defect is an out-of-enum mode,
	// so the failure pins the mode field rather than some other violation.
	// (ParsePlan intentionally omits a post-decode name-guard like
	// selfplan.Parse has — lane-plan semantic checks live in
	// EmitHandoffs -> ValidatePlan.)
	raw := []byte(`{"name":"p","repo":"r","lanes":[{"name":"l","mode":"codex.desktop"}]}`)
	_, err := ParsePlan(raw)
	if err == nil {
		t.Fatal("expected ParsePlan to reject a lane with an out-of-enum mode")
	}
	// Pin the stable, self-owned schema filename (emitted by contract.Validate's
	// wrapper) so the test stays meaningful even if jsonschema changes its
	// pointer rendering; keep the "mode" check as an intent signal.
	if !strings.Contains(err.Error(), "vibe-lane-plan.schema.json") {
		t.Fatalf("error should name the schema: %v", err)
	}
	if !strings.Contains(err.Error(), "mode") {
		t.Fatalf("error should cite the offending mode field: %v", err)
	}
}

func TestParsePlanAcceptsCommittedLanePlan(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "docs", "examples", "pawfall-feedback-lanes.json"))
	if err != nil {
		t.Fatalf("read committed lane-plan: %v", err)
	}
	plan, err := ParsePlan(raw)
	if err != nil {
		t.Fatalf("committed lane-plan should parse: %v", err)
	}
	if plan.Name == "" || len(plan.Lanes) == 0 {
		t.Fatalf("expected a populated plan, got %#v", plan)
	}
}

func TestEmitHandoffsWritesAutonomousLane(t *testing.T) {
	plan := Plan{
		Name: "demo",
		Repo: "C:/vibe",
		Lanes: []Lane{
			{
				Name:     "long-haul",
				Mode:     ModeAutonomous,
				Branch:   "feat/long-haul",
				Writes:   []string{"go/agent/**"},
				Prompt:   "Harden the agent SDK across sessions.",
				Requires: []string{"go test ./..."},
				Autonomous: &Autonomous{
					Progress: "PROGRESS.md",
					Horizon:  "long",
				},
			},
		},
	}

	outDir := t.TempDir()
	result, err := EmitHandoffs(context.Background(), plan, outDir)
	if err != nil {
		t.Fatalf("emit autonomous lane: %v", err)
	}
	if len(result.Handoffs) != 1 {
		t.Fatalf("expected 1 handoff, got %d", len(result.Handoffs))
	}
	if result.Handoffs[0].Mode != ModeAutonomous {
		t.Fatalf("expected mode %q, got %q", ModeAutonomous, result.Handoffs[0].Mode)
	}

	raw, err := os.ReadFile(result.Handoffs[0].Path)
	if err != nil {
		t.Fatalf("read emitted handoff: %v", err)
	}
	body := string(raw)
	for _, needle := range []string{
		"# Autonomous Lane: long-haul",
		"## Autonomous Operating Contract",
		"### Startup & Resumption Protocol",
		"PROGRESS.md",
	} {
		if !strings.Contains(body, needle) {
			t.Fatalf("emitted autonomous handoff missing %q:\n%s", needle, body)
		}
	}
}

func TestParsePlanDecodesAutonomousLane(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "docs", "examples", "vibe-autonomous-lanes.json"))
	if err != nil {
		t.Fatalf("read committed autonomous lane-plan: %v", err)
	}
	plan, err := ParsePlan(raw)
	if err != nil {
		t.Fatalf("committed autonomous lane-plan should parse: %v", err)
	}

	var auto *Lane
	for i := range plan.Lanes {
		if plan.Lanes[i].Mode == ModeAutonomous {
			auto = &plan.Lanes[i]
			break
		}
	}
	if auto == nil {
		t.Fatalf("expected an autonomous lane in %s", plan.Name)
	}
	if auto.Autonomous == nil {
		t.Fatal("autonomous lane should decode a non-nil Autonomous block")
	}
	if auto.Autonomous.Progress != "PROGRESS.md" {
		t.Fatalf("expected progress PROGRESS.md, got %q", auto.Autonomous.Progress)
	}
	if auto.Autonomous.Horizon != "long" {
		t.Fatalf("expected horizon long, got %q", auto.Autonomous.Horizon)
	}
	if len(auto.Autonomous.Roles) == 0 {
		t.Fatal("expected a non-empty roles list")
	}

	// Non-autonomous lanes must not carry an Autonomous block.
	for _, lane := range plan.Lanes {
		if lane.Mode != ModeAutonomous && lane.Autonomous != nil {
			t.Fatalf("lane %q (mode %q) unexpectedly carries an Autonomous block", lane.Name, lane.Mode)
		}
	}
}
