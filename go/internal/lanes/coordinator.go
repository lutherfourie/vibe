package lanes

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/lutherfourie/vibe/go/internal/contract"
	"github.com/lutherfourie/vibe/go/internal/prompts"
)

const (
	ModeCodexWeb   = "codex.web"
	ModeLocal      = "local"
	ModeAutonomous = "autonomous"
)

// ParsePlan validates raw JSON against the canonical lane-plan schema and then
// decodes it into a Plan. It fails fast on contract violations (missing
// required fields, an out-of-enum mode, unknown properties) before any handoff
// work, so callers never operate on a malformed plan. The cross-lane
// write-scope rule remains in ValidatePlan, which EmitHandoffs applies.
func ParsePlan(raw []byte) (Plan, error) {
	if err := contract.Validate(contract.LanePlanSchema, raw); err != nil {
		return Plan{}, fmt.Errorf("invalid lane-plan: %w", err)
	}
	var plan Plan
	if err := json.Unmarshal(raw, &plan); err != nil {
		return Plan{}, fmt.Errorf("parse lane-plan JSON: %w", err)
	}
	return plan, nil
}

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
		Name:       lane.Name,
		Mode:       lane.Mode,
		Branch:     lane.Branch,
		Reads:      lane.Reads,
		Writes:     lane.Writes,
		Prompt:     lane.Prompt,
		Requires:   lane.Requires,
		Autonomous: promptAutonomous(lane.Autonomous),
	}
	switch lane.Mode {
	case ModeCodexWeb:
		body = prompts.CodexWebHandoff(plan.Name, plan.Repo, promptLane)
	case ModeLocal:
		body = prompts.LocalChecklist(plan.Name, plan.Repo, promptLane)
	case ModeAutonomous:
		body = prompts.AutonomousHandoff(plan.Name, plan.Repo, promptLane)
	default:
		return Handoff{}, fmt.Errorf("lane %q has unsupported mode %q", lane.Name, lane.Mode)
	}

	// Modern declarations support (Tool/Eval/Template/Policy/Workflow + Steps):
	// append a compact execution contract section for autonomous lanes.
	// Keeps handoff generation fully compatible for legacy plans (no decls/steps).
	if lane.Mode == ModeAutonomous && (len(plan.Tools) > 0 || len(plan.Evals) > 0 || len(plan.Templates) > 0 || len(plan.Policies) > 0 || len(plan.Workflows) > 0 || len(lane.Steps) > 0) {
		body += buildModernDeclsSection(plan, lane)
	}

	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		return Handoff{}, fmt.Errorf("write handoff for lane %q: %w", lane.Name, err)
	}

	return Handoff{LaneName: lane.Name, Mode: lane.Mode, Path: path}, nil
}

// buildModernDeclsSection injects a summary of declared tools/evals/etc and
// step graph into autonomous handoffs. This surfaces the new grammar decls
// to the executing agent (e.g. Pawfall cat asset review loop).
func buildModernDeclsSection(plan Plan, lane Lane) string {
	var b strings.Builder
	b.WriteString("\n\n## Modern Vibe Declarations (Tool/Eval/Template/Policy/Workflow)\n\n")
	b.WriteString("This lane uses modern structured declarations. Use the registered step executors (Temporal Activity style) below.\n\n")

	if len(plan.Tools) > 0 {
		b.WriteString("### Declared Tools\n")
		for _, t := range plan.Tools {
			fmt.Fprintf(&b, "- %s: %s (provider=%s mcp=%s)\n", t.Name, t.Description, t.Provider, t.MCP)
		}
	}
	if len(plan.Evals) > 0 {
		b.WriteString("### Declared Evals\n")
		for _, e := range plan.Evals {
			fmt.Fprintf(&b, "- %s: criteria=%v threshold=%.2f\n", e.Name, e.Criteria, e.Threshold)
		}
	}
	if len(plan.Templates) > 0 {
		b.WriteString("### Declared Templates\n")
		for _, tm := range plan.Templates {
			fmt.Fprintf(&b, "- %s\n", tm.Name)
		}
	}
	if len(plan.Policies) > 0 {
		b.WriteString("### Declared Policies\n")
		for _, p := range plan.Policies {
			fmt.Fprintf(&b, "- %s: sandbox=%v rateLimit=%d allowed=%v\n", p.Name, p.Sandbox, p.RateLimit, p.AllowedTools)
		}
	}
	if len(plan.Workflows) > 0 {
		b.WriteString("### Declared Workflows\n")
		for _, w := range plan.Workflows {
			fmt.Fprintf(&b, "- %s: steps=%v parallel=%v\n", w.Name, w.Steps, w.Parallel)
		}
	}
	if len(lane.Steps) > 0 {
		b.WriteString("### Lane Steps (executable graph)\n")
		for i, s := range lane.Steps {
			fmt.Fprintf(&b, "%d. type=%s tool=%s eval=%s if=%s checkpoint=%s\n", i+1, s.Type, s.Tool, s.Eval, s.If, s.Checkpoint)
		}
	}
	return b.String()
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

	// Modern decl validation (non-breaking for legacy plans with zero decls).
	// Names must be present; full cross-ref and policy enforcement is in
	// step executors (agent loop).
	for i, t := range plan.Tools {
		if strings.TrimSpace(t.Name) == "" {
			return fmt.Errorf("plan tool[%d] name is required", i)
		}
	}
	for i, e := range plan.Evals {
		if strings.TrimSpace(e.Name) == "" {
			return fmt.Errorf("plan eval[%d] name is required", i)
		}
	}
	for i, t := range plan.Templates {
		if strings.TrimSpace(t.Name) == "" {
			return fmt.Errorf("plan template[%d] name is required", i)
		}
	}
	for i, p := range plan.Policies {
		if strings.TrimSpace(p.Name) == "" {
			return fmt.Errorf("plan policy[%d] name is required", i)
		}
	}
	for i, w := range plan.Workflows {
		if strings.TrimSpace(w.Name) == "" {
			return fmt.Errorf("plan workflow[%d] name is required", i)
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

// promptAutonomous maps the runtime IR's autonomous config to the prompt
// package's dependency-free view, preserving nil for non-autonomous lanes.
func promptAutonomous(a *Autonomous) *prompts.Autonomous {
	if a == nil {
		return nil
	}
	return &prompts.Autonomous{
		Progress:        a.Progress,
		Horizon:         a.Horizon,
		CheckpointEvery: a.CheckpointEvery,
		Roles:           a.Roles,
		Research:        a.Research,
	}
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
