package devpool

import (
	"context"
	"strings"
	"sync"

	"github.com/lutherfourie/vibe/go/agent"
)

// SubagentRunner runs an editing subagent inside a worktree. The real, process-
// spawning implementation is deliberately deferred to a later supervised slice
// (per the ADR's "supervised first use" rail); this package ships the interface,
// a FakeRunner for tests, and a thin ProviderRunner adapter that is never invoked
// against a real process by any test here.
type SubagentRunner interface {
	// Run executes the subagent in worktreeDir with prompt and returns its final
	// result text. An error means the subagent could not run or reported failure.
	Run(ctx context.Context, worktreeDir, prompt string) (string, error)
}

// RunnerCall records one invocation of FakeRunner.Run.
type RunnerCall struct {
	WorktreeDir string
	Prompt      string
}

// FakeRunner is a deterministic, in-memory SubagentRunner for tests. It records
// every call and returns canned results. By default Run returns Result/Err for
// every call; ResultsByAttempt, when set, supplies a distinct (result, err) per
// successive call (1-indexed by call number) so tests can script multi-attempt
// behavior. It is safe for concurrent use.
type FakeRunner struct {
	mu sync.Mutex

	// Result and Err are the default canned outputs returned by every call.
	Result string
	Err    error

	// ResultsByAttempt overrides Result/Err per call index when non-nil; calls
	// beyond its length fall back to Result/Err.
	ResultsByAttempt []RunnerResult

	calls []RunnerCall
}

// RunnerResult is one scripted (text, err) outcome for FakeRunner.
type RunnerResult struct {
	Text string
	Err  error
}

var _ SubagentRunner = (*FakeRunner)(nil)

// Run records the call and returns the canned result for this invocation.
func (f *FakeRunner) Run(_ context.Context, worktreeDir, prompt string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	idx := len(f.calls)
	f.calls = append(f.calls, RunnerCall{WorktreeDir: worktreeDir, Prompt: prompt})
	if idx < len(f.ResultsByAttempt) {
		r := f.ResultsByAttempt[idx]
		return r.Text, r.Err
	}
	return f.Result, f.Err
}

// Calls returns a copy of every recorded invocation, in order.
func (f *FakeRunner) Calls() []RunnerCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]RunnerCall, len(f.calls))
	copy(out, f.calls)
	return out
}

// CallCount returns how many times Run was invoked.
func (f *FakeRunner) CallCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.calls)
}

// ProviderRunner adapts an agent.Provider into a SubagentRunner by issuing a
// single TurnRequest with Cwd pinned to the worktree directory and draining it
// via agent.CollectTurn. It is the bridge to a real CLI subagent (codex/grok)
// for the future supervised slice.
//
// IMPORTANT: no test in this package constructs a ProviderRunner over a real CLI
// provider — doing so would spawn an external process. Tests cover it (if at all)
// only with agent.FakeProvider. The pool itself takes a SubagentRunner interface,
// so production wiring and tests stay decoupled.
type ProviderRunner struct {
	// Provider is the underlying agent provider (e.g. a codex/grok adapter).
	Provider agent.Provider
	// PermissionMode is an optional provider-specific tool-permission hint passed
	// through on each turn (e.g. the Claude CLI's "acceptEdits").
	PermissionMode string
}

var _ SubagentRunner = ProviderRunner{}

// Run issues one provider turn rooted at worktreeDir and returns the assembled
// text. A provider error (or terminal error event) is surfaced as the error.
func (r ProviderRunner) Run(ctx context.Context, worktreeDir, prompt string) (string, error) {
	req := agent.TurnRequest{
		Messages:       []agent.Message{{Role: agent.RoleUser, Content: prompt}},
		Cwd:            worktreeDir,
		PermissionMode: r.PermissionMode,
	}
	res := agent.CollectTurn(ctx, r.Provider, req)
	if res.Err != nil {
		return strings.TrimSpace(res.Text), res.Err
	}
	return strings.TrimSpace(res.Text), nil
}
