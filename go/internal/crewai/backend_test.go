package crewai

import (
	"context"
	"testing"

	"github.com/lutherfourie/vibe/go/internal/lanes"
)

func TestTargetBackendInterfaceIsSatisfiedByFake(t *testing.T) {
	// Compile-time: ensure a value can satisfy via an adapter if needed.
	var _ TargetBackend = &fakeBackend{}
}

type fakeBackend struct{}

func (fakeBackend) Execute(ctx context.Context, req ExecuteRequest) (ExecuteResult, error) {
	return ExecuteResult{Success: true, Output: "fake:" + req.Lane.Name}, nil
}

func TestExecuteRequestUsesLanesLane(t *testing.T) {
	req := ExecuteRequest{
		Lane:    lanes.Lane{Name: "demo", Writes: []string{"go/internal/crewai"}},
		DryRun:  true,
		CrewDir: t.TempDir(),
	}
	if req.Lane.Name != "demo" || len(req.Lane.Writes) != 1 {
		t.Fatalf("lanes.Lane not carried correctly: %+v", req.Lane)
	}
}
