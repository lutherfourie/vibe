package lanes

import "testing"

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
