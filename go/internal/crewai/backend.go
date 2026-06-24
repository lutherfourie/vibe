package crewai

import (
	"context"

	"github.com/lutherfourie/vibe/go/internal/lanes"
)

// TargetBackend is the pluggable execution surface for a compiled agent backend
// (CrewAI today; LangGraph or others later). Implementations must not hardcode
// a framework inside shared call sites.
type TargetBackend interface {
	Execute(ctx context.Context, req ExecuteRequest) (ExecuteResult, error)
}

// ExecuteRequest carries the lane IR (for Reads/Writes/Prompt/Name scoping),
// the location of already-generated crew artifacts, and execution controls.
type ExecuteRequest struct {
	Lane         lanes.Lane
	CrewDir      string // dir containing crew.py / flow.py / tools.py + manifest (from compiler)
	RootDir      string // repo root for PROGRESS.md and write-scope resolution
	ProgressPath string // e.g. "PROGRESS.md" or lane-specific; defaults handled by impl
	DryRun       bool   // when true, use safe mock path (no LLM, minimal python if any)
	// ForceRun when true + DryRun=false bypasses the live-run human gate (for
	// controlled internal smoke of the python execution seam only).
	ForceRun bool
}

// ExecuteResult is backend-agnostic result.
type ExecuteResult struct {
	Success      bool
	Output       string
	Gated        bool   // human gate was hit; live execution was not performed
	Checkpointed bool   // progress checkpoint(s) were appended
}
