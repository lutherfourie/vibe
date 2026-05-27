package lanes

import (
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
