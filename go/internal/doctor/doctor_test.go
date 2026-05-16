package doctor

import (
	"context"
	"testing"
)

func TestRunMarksMissingRequiredToolAsFailure(t *testing.T) {
	report := Run(context.Background(), []Requirement{
		{Name: "missing", Command: "definitely-not-a-real-vibe-tool", Required: true},
	})

	if report.OK {
		t.Fatal("expected report to fail when a required tool is missing")
	}
	if len(report.Checks) != 1 {
		t.Fatalf("expected one check, got %d", len(report.Checks))
	}
	if report.Checks[0].Found {
		t.Fatal("missing tool should not be found")
	}
}
