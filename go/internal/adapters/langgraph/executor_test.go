package langgraphadapter

import (
	"context"
	"strings"
	"testing"

	"github.com/lutherfourie/vibe/go/internal/crewai"
	"github.com/lutherfourie/vibe/go/internal/lanes"
)

func TestLangGraphStubSatisfiesTargetBackend(t *testing.T) {
	var _ crewai.TargetBackend = NewBackend()
}

func TestLangGraphStubReturnsNotImplementedSignal(t *testing.T) {
	b := NewBackend()
	req := crewai.ExecuteRequest{
		Lane:    lanes.Lane{Name: "lg-test", Writes: []string{"."}},
		CrewDir: t.TempDir(),
		DryRun:  true,
	}
	res, err := b.Execute(context.Background(), req)
	if err == nil {
		t.Fatalf("expected non-nil err from langgraph stub")
	}
	if !strings.Contains(err.Error(), "langgraph backend: not yet implemented (seam stub)") {
		t.Fatalf("err must signal not implemented: %v", err)
	}
	if !strings.Contains(res.Output, "langgraph backend: not yet implemented (seam stub)") {
		t.Fatalf("result output must carry not-impl signal: %s", res.Output)
	}
	if res.Success {
		t.Fatalf("stub must report !Success")
	}
}
