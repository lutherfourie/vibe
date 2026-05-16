package bootstrap

import (
	"testing"

	"github.com/lutherfourie/vibe/go/internal/lanes"
)

func TestSelfMakingPlanHasDisjointWriteScopes(t *testing.T) {
	plan := SelfMakingPlan("C:/vibe")
	if err := lanes.ValidatePlan(plan); err != nil {
		t.Fatalf("self-making plan should validate: %v", err)
	}
}
