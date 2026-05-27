package contract

import (
	"strings"
	"testing"
)

func TestValidateRejectsSelfPlanMissingName(t *testing.T) {
	// Every required self-plan field is present EXCEPT name, so the only reason
	// this fails is the missing name (non-vacuous negative test).
	raw := []byte(`{
		"source": "examples/vibe-self.vibe",
		"providers": [],
		"routes": {},
		"surfaces": [],
		"agents": [],
		"lanes": [],
		"gates": [],
		"notes": []
	}`)
	err := Validate(SelfPlanSchema, raw)
	if err == nil {
		t.Fatal("expected self-plan missing name to fail validation")
	}
	if !strings.Contains(err.Error(), SelfPlanSchema) {
		t.Fatalf("error should name the schema %q: %v", SelfPlanSchema, err)
	}
	// Pin the violated field so this test keeps guarding the missing-name case
	// even if a later schema change trips a different required field.
	if !strings.Contains(err.Error(), "name") {
		t.Fatalf("error should cite the missing field %q: %v", "name", err)
	}
}

func TestValidateRejectsLanePlanBadMode(t *testing.T) {
	// Structurally complete lane-plan whose only defect is an out-of-enum mode.
	raw := []byte(`{
		"name": "pawfall-feedback",
		"repo": "C:/GameSpree",
		"lanes": [
			{ "name": "feedback-triage", "mode": "codex.desktop" }
		]
	}`)
	err := Validate(LanePlanSchema, raw)
	if err == nil {
		t.Fatal("expected lane-plan with out-of-enum mode to fail validation")
	}
	if !strings.Contains(err.Error(), LanePlanSchema) {
		t.Fatalf("error should name the schema %q: %v", LanePlanSchema, err)
	}
	// Pin the violated field so this test keeps guarding the mode-enum case
	// rather than passing on any unrelated future violation.
	if !strings.Contains(err.Error(), "mode") {
		t.Fatalf("error should cite the offending field %q: %v", "mode", err)
	}
}

func TestValidateAcceptsMinimalLanePlan(t *testing.T) {
	raw := []byte(`{
		"name": "pawfall-feedback",
		"repo": "C:/GameSpree",
		"lanes": [
			{ "name": "feedback-triage", "mode": "codex.web" },
			{ "name": "unity-runtime-local", "mode": "local" }
		]
	}`)
	if err := Validate(LanePlanSchema, raw); err != nil {
		t.Fatalf("minimal valid lane-plan should pass: %v", err)
	}
}
