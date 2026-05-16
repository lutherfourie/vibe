package lanes

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/lutherfourie/vibe/go/internal/prompts"
)

const (
	ModeCodexWeb = "codex.web"
	ModeLocal    = "local"
)

// EmitHandoffs validates a lane plan and writes one markdown handoff per lane.
func EmitHandoffs(ctx context.Context, plan Plan, outDir string) (EmitResult, error) {
	if err := ValidatePlan(plan); err != nil {
		return EmitResult{}, err
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return EmitResult{}, fmt.Errorf("create output directory: %w", err)
	}

	jobs := make(chan Lane)
	results := make(chan emitResult)

	workerCount := len(plan.Lanes)
	if workerCount > 4 {
		workerCount = 4
	}
	if workerCount == 0 {
		return EmitResult{}, nil
	}

	var wg sync.WaitGroup
	wg.Add(workerCount)
	for i := 0; i < workerCount; i++ {
		go func() {
			defer wg.Done()
			for lane := range jobs {
				handoff, err := emitLane(ctx, plan, lane, outDir)
				results <- emitResult{handoff: handoff, err: err}
			}
		}()
	}

	go func() {
		defer close(jobs)
		for _, lane := range plan.Lanes {
			select {
			case <-ctx.Done():
				return
			case jobs <- lane:
			}
		}
	}()

	go func() {
		wg.Wait()
		close(results)
	}()

	var handoffs []Handoff
	for result := range results {
		if result.err != nil {
			return EmitResult{}, result.err
		}
		handoffs = append(handoffs, result.handoff)
	}

	sort.Slice(handoffs, func(i, j int) bool {
		return handoffs[i].LaneName < handoffs[j].LaneName
	})

	return EmitResult{Handoffs: handoffs}, nil
}

type emitResult struct {
	handoff Handoff
	err     error
}

func emitLane(ctx context.Context, plan Plan, lane Lane, outDir string) (Handoff, error) {
	select {
	case <-ctx.Done():
		return Handoff{}, ctx.Err()
	default:
	}

	filename := sanitizeFilename(lane.Name) + ".md"
	path := filepath.Join(outDir, filename)

	var body string
	promptLane := prompts.Lane{
		Name:     lane.Name,
		Mode:     lane.Mode,
		Branch:   lane.Branch,
		Reads:    lane.Reads,
		Writes:   lane.Writes,
		Prompt:   lane.Prompt,
		Requires: lane.Requires,
	}
	switch lane.Mode {
	case ModeCodexWeb:
		body = prompts.CodexWebHandoff(plan.Name, plan.Repo, promptLane)
	case ModeLocal:
		body = prompts.LocalChecklist(plan.Name, plan.Repo, promptLane)
	default:
		return Handoff{}, fmt.Errorf("lane %q has unsupported mode %q", lane.Name, lane.Mode)
	}

	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		return Handoff{}, fmt.Errorf("write handoff for lane %q: %w", lane.Name, err)
	}

	return Handoff{LaneName: lane.Name, Mode: lane.Mode, Path: path}, nil
}

// ValidatePlan applies the first "do not step on toes" rule: two lanes may not
// declare overlapping write scopes.
func ValidatePlan(plan Plan) error {
	if strings.TrimSpace(plan.Name) == "" {
		return fmt.Errorf("plan name is required")
	}
	if strings.TrimSpace(plan.Repo) == "" {
		return fmt.Errorf("plan repo is required")
	}

	seen := map[string]string{}
	for _, lane := range plan.Lanes {
		if strings.TrimSpace(lane.Name) == "" {
			return fmt.Errorf("lane name is required")
		}
		if strings.TrimSpace(lane.Mode) == "" {
			return fmt.Errorf("lane %q mode is required", lane.Name)
		}
		for _, write := range lane.Writes {
			scope, err := normalizeScope(write)
			if err != nil {
				return fmt.Errorf("lane %q write scope %q: %w", lane.Name, write, err)
			}
			for existing, owner := range seen {
				if scopesOverlap(existing, scope) {
					return fmt.Errorf("lane %q write scope %q overlaps lane %q scope %q", lane.Name, write, owner, existing)
				}
			}
			seen[scope] = lane.Name
		}
	}

	return nil
}

func normalizeScope(scope string) (string, error) {
	clean := filepath.ToSlash(filepath.Clean(strings.TrimSpace(scope)))
	if clean == "." || clean == "" {
		return "", fmt.Errorf("empty scope")
	}
	if filepath.IsAbs(clean) || strings.HasPrefix(clean, "../") || clean == ".." {
		return "", fmt.Errorf("scope must be relative to repo root")
	}
	return strings.TrimSuffix(clean, "/**"), nil
}

func scopesOverlap(a, b string) bool {
	if a == b {
		return true
	}
	return strings.HasPrefix(a, b+"/") || strings.HasPrefix(b, a+"/")
}

func sanitizeFilename(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	lastDash := false
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "lane"
	}
	return out
}
