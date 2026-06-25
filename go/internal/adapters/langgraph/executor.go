package langgraphadapter

import (
	"context"
	"errors"

	"github.com/lutherfourie/vibe/go/internal/crewai"
)

// stubBackend is the minimal LangGraph TargetBackend seam proof (P5).
// Full implementation is deferred (Luther's B2: LangGraph as production target later).
// This proves CrewAI is not hardcoded behind the TargetBackend interface.
type stubBackend struct{}

var _ crewai.TargetBackend = (*stubBackend)(nil)

// NewBackend returns the langgraph seam stub.
func NewBackend() crewai.TargetBackend {
	return &stubBackend{}
}

func (s *stubBackend) Execute(ctx context.Context, req crewai.ExecuteRequest) (crewai.ExecuteResult, error) {
	_ = req // unused in stub
	return crewai.ExecuteResult{
		Success: false,
		Output:  "langgraph backend: not yet implemented (seam stub)",
	}, errors.New("langgraph backend: not yet implemented (seam stub)")
}

// (lanes imported only for future seam parity; not required for stub behavior)
