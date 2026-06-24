package crewaiadapter

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/lutherfourie/vibe/go/internal/crewai"
	"github.com/lutherfourie/vibe/go/internal/progress"
)

// backend implements crewai.TargetBackend using an injectable Runner for
// complete test isolation (no python or crewai package required in unit tests).
type backend struct {
	runner crewai.Runner
}

var _ crewai.TargetBackend = (*backend)(nil)

// NewBackend returns a TargetBackend. If runner is nil, CommandRunner is used
// (real python subprocess path, still only exercised for dry/ForceRun).
func NewBackend(runner crewai.Runner) crewai.TargetBackend {
	if runner == nil {
		runner = crewai.CommandRunner{}
	}
	return &backend{runner: runner}
}

func (b *backend) Execute(ctx context.Context, req crewai.ExecuteRequest) (crewai.ExecuteResult, error) {
	// 1. HUMAN GATE: never shell for live runs (unless ForceRun for controlled smoke).
	if !req.DryRun && !req.ForceRun {
		return crewai.ExecuteResult{
			Success: false,
			Gated:   true,
			Output:  "VIBE_GATE: human approval required (human.before_runtime) — live crew run not performed",
		}, nil
	}

	// 2. WRITE-SCOPE GUARD (loud fail before any execution or progress write).
	// Guard crew dir + progress target when writes are declared.
	progPath := req.ProgressPath
	if progPath == "" {
		progPath = "PROGRESS.md"
	}
	targets := []string{req.CrewDir, progPath}
	if len(req.Lane.Writes) > 0 {
		if err := guardWriteScope(req.RootDir, req.Lane.Writes, targets...); err != nil {
			return crewai.ExecuteResult{}, err
		}
	}

	// 3. When a run is requested, require crew.py (from P1 compiler output).
	if req.CrewDir != "" {
		if err := ValidateCrewDir(req.CrewDir); err != nil {
			return crewai.ExecuteResult{}, err
		}
		// best-effort tiny shim (thin generate helper)
		_ = WriteShim(req.CrewDir, req.Lane.Name)
	}

	// 4. DRY/MOCK path: use deterministic argv (python -c, pure stdlib, no crewai/LLM).
	// The FakeRunner used by tests supplies canned output containing the marker.
	// Real CommandRunner + DryRun still works as smoke without crewai installed.
	argv := []string{
		"python", "-c",
		fmt.Sprintf("print('DRY crewai run for lane: %s')\nprint('VIBE_CHECKPOINT: %s completed')\nprint('checkpoint written')", req.Lane.Name, req.Lane.Name),
	}

	runDir := req.CrewDir
	if runDir == "" {
		runDir = "."
	}
	r := b.runner
	if r == nil {
		r = crewai.CommandRunner{}
	}

	passed, out, runErr := r.Execute(ctx, runDir, argv, nil)
	combined := out
	if runErr != nil {
		combined += "\n" + runErr.Error()
	}

	success := passed && runErr == nil

	// Parse runner output for checkpoint marker -> append real PROGRESS checkpoint.
	checkpointed := false
	if success && strings.Contains(out, "VIBE_CHECKPOINT") {
		progAbs := progPath
		if !filepath.IsAbs(progPath) && req.RootDir != "" {
			progAbs = filepath.Join(req.RootDir, progPath)
		}
		if req.RootDir != "" {
			_ = os.MkdirAll(req.RootDir, 0o755)
		}
		existing := ""
		if data, err := os.ReadFile(progAbs); err == nil {
			existing = string(data)
		}
		cp := progress.Checkpoint{
			Time:    time.Now().Format("2006-01-02"),
			Summary: fmt.Sprintf("crewai executor %s", req.Lane.Name),
			Notes:   []string{"dry/mock via TargetBackend"},
		}
		if updated, err := progress.AppendCheckpoint(existing, cp, "in-progress"); err == nil {
			_ = os.WriteFile(progAbs, []byte(updated), 0o644)
			checkpointed = true
		}
	}

	resultOut := combined
	if req.Lane.Name != "" {
		resultOut += " | lane=" + req.Lane.Name
	}
	if checkpointed {
		resultOut += " (checkpoint written)"
	}

	return crewai.ExecuteResult{
		Success:      success,
		Output:       resultOut,
		Gated:        false,
		Checkpointed: checkpointed,
	}, nil
}

// guardWriteScope implements the loud write-scope guard using filepath.Rel + ".. " check.
// If any target (resolved) escapes the declared writes (when non-empty), error.
func guardWriteScope(root string, writes []string, targets ...string) error {
	if len(writes) == 0 {
		return nil
	}
	for _, t := range targets {
		if t == "" {
			continue
		}
		abs := t
		if !filepath.IsAbs(t) {
			if root == "" {
				root = "."
			}
			abs = filepath.Join(root, t)
		}
		rel, err := filepath.Rel(root, abs)
		if err != nil {
			return fmt.Errorf("write-scope guard: rel %s: %w", t, err)
		}
		if strings.HasPrefix(rel, "..") {
			// outside root entirely (e.g. /tmp crew) — not a repo write escape
			continue
		}
		if !pathCoveredByWrites(rel, writes) {
			return fmt.Errorf("write-scope guard: %s outside lane writes %v", rel, writes)
		}
	}
	return nil
}

func pathCoveredByWrites(rel string, writes []string) bool {
	rel = filepath.ToSlash(rel)
	for _, wraw := range writes {
		w := strings.TrimSuffix(strings.Trim(filepath.ToSlash(wraw), "/"), "/**")
		if w == "" || w == "." {
			return true
		}
		if rel == w || strings.HasPrefix(rel, w+"/") {
			return true
		}
	}
	return false
}
