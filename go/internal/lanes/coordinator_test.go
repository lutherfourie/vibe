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

// TestParsePlanAcceptsModernVibeDecls exercises the new Tool/Eval/Template/Policy/Workflow
// + Steps support added for grammar modern standards. Compatible with legacy.
func TestParsePlanAcceptsModernVibeDecls(t *testing.T) {
	// Minimal plan inspired by examples/11-pawfall-asset-review.vibe + Pawfall asset review
	// (generate_cat_frame tool, expert_review eval, template, policy, workflow + steps).
	raw := []byte(`{
		"name": "pawfall-asset-review",
		"repo": "C:/GameSpree/Pawfall",
		"lanes": [{
			"name": "asset-gen-review",
			"mode": "autonomous",
			"prompt": "Generate + review cat frames until approved.",
			"steps": [
				{"type": "tool", "tool": "generate_cat_frame", "args": {"mood": "pounce"}},
				{"type": "eval", "eval": "expert_review", "dimensions": ["technical_quality","motion_fidelity"], "threshold": 4.2}
			]
		}],
		"tools": [{
			"name": "generate_cat_frame",
			"description": "Generate base or motion frame for Pawfall cat mood using Flux/LTX",
			"provider": "flux-klein"
		}, {
			"name": "expert_review",
			"description": "Run multi-expert Grok review on animation frames"
		}],
		"evals": [{
			"name": "expert_review",
			"criteria": ["LeadAnimator motion", "CatEthologist behavior"],
			"threshold": 4.5,
			"llm": "grok-expert"
		}],
		"templates": [{
			"name": "cat_motion",
			"prompt": "the cat {motion}",
			"variables": ["motion"]
		}],
		"policies": [{
			"name": "asset-policy",
			"sandbox": true,
			"allowedTools": ["generate_cat_frame", "expert_review"]
		}],
		"workflows": [{
			"name": "cat-review-iteration",
			"steps": ["gen", "review", "fix"],
			"retries": 3,
			"policy": "asset-policy"
		}]
	}`)

	plan, err := ParsePlan(raw)
	if err != nil {
		t.Fatalf("modern decls lane plan should parse: %v", err)
	}
	if len(plan.Tools) != 2 {
		t.Fatalf("expected 2 tools, got %d", len(plan.Tools))
	}
	if plan.Tools[0].Name != "generate_cat_frame" {
		t.Fatalf("tool[0] name = %q", plan.Tools[0].Name)
	}
	if len(plan.Evals) != 1 || plan.Evals[0].Name != "expert_review" {
		t.Fatal("expected expert_review eval")
	}
	if len(plan.Templates) != 1 || plan.Templates[0].Name != "cat_motion" {
		t.Fatal("expected cat_motion template")
	}
	if len(plan.Policies) != 1 || len(plan.Policies[0].AllowedTools) != 2 {
		t.Fatal("expected asset-policy with tools")
	}
	if len(plan.Workflows) != 1 || plan.Workflows[0].Retries != 3 {
		t.Fatal("expected workflow")
	}
	lane := plan.Lanes[0]
	if len(lane.Steps) != 2 || lane.Steps[0].Type != "tool" || lane.Steps[1].Eval != "expert_review" {
		t.Fatalf("expected 2 steps on autonomous lane, got %+v", lane.Steps)
	}
	// Still emits handoff (modern section appended for autonomous)
	outDir := t.TempDir()
	res, err := EmitHandoffs(context.Background(), plan, outDir)
	if err != nil {
		t.Fatalf("emit with modern decls: %v", err)
	}
	if len(res.Handoffs) != 1 {
		t.Fatal("expected 1 handoff")
	}
}
