// Package devpool provides the reusable machinery for a continuous, gated,
// worktree-isolated multi-subagent development pool (M3, slice 2). The loop is:
// pull a task -> run an editing subagent inside an isolated git worktree -> run a
// verify gate -> commit-on-green or discard-on-red, atomically -> repeat.
//
// It deliberately leans on the proven external-subagent + external-gate model
// (see docs/adr/0001-continuous-fanout-dev-pool.md) rather than an in-process
// file mutator. The risky pieces (running a real CLI subagent) are kept behind
// the SubagentRunner interface so the orchestrator can be fully unit-tested with
// fakes; only WorktreeManager, Gate, and Committer touch git/processes, and each
// has hermetic tests against a temporary repo that skip when git is absent.
//
// Safety rails honored here (non-negotiable, per the ADR):
//   - No push. The Committer never pushes; there is no Push surface at all.
//   - Gate every change. A change lands only if its verify command exits 0;
//     otherwise the worktree is discarded.
//   - Explicit scopes. Commit stages only the task's scope globs, never `git add -A`.
//   - STOP sentinel + dry-run. The pool halts pulling new tasks when the sentinel
//     file exists; dry-run plans without editing or committing.
package devpool

import (
	"context"
	"errors"
	"sync"
)

// Task is a unit of work pulled from a TaskSource and handed to one subagent.
type Task struct {
	// ID uniquely identifies the task. It is also used (sanitized) to derive the
	// worktree directory name, so keep it filesystem-friendly.
	ID string
	// Description is the prompt/instruction handed to the editing subagent.
	Description string
	// Scope is the set of path globs the commit is allowed to stage. The gate may
	// observe any change, but only files matching these globs are ever committed.
	Scope []string
	// BaseBranch is the git ref the throwaway worktree is based on.
	BaseBranch string
	// Metadata carries optional context for the runner or gate. It is never
	// interpreted by the pool itself.
	Metadata map[string]string
}

// ErrNoMoreTasks is the sentinel a TaskSource returns from Pull when its backlog
// is permanently drained. The pool treats it as a clean shutdown signal, not a
// transient error to retry.
var ErrNoMoreTasks = errors.New("devpool: no more tasks")

// TaskSource provides a stream of work and records terminal outcomes. The pool
// pulls one task at a time and reports exactly one MarkSuccess or MarkFailure per
// task it finishes.
type TaskSource interface {
	// Pull returns the next task, ErrNoMoreTasks when the backlog is permanently
	// drained, or another error for a transient failure. It should observe ctx.
	Pull(ctx context.Context) (*Task, error)
	// MarkSuccess records that the task committed as commitSHA.
	MarkSuccess(ctx context.Context, taskID string, commitSHA string) error
	// MarkFailure records that the task did not land, with a human-readable reason.
	MarkFailure(ctx context.Context, taskID string, reason string) error
}

// SliceTaskSource is a simple in-memory TaskSource that drains a slice. Pull
// hands out tasks in order and returns ErrNoMoreTasks once exhausted. Outcomes
// are recorded so tests and callers can inspect them. It is safe for concurrent
// use by the pool's workers.
type SliceTaskSource struct {
	mu       sync.Mutex
	tasks    []*Task
	next     int
	Outcomes []TaskOutcome
}

// TaskOutcome records a single terminal result reported back to the source.
type TaskOutcome struct {
	TaskID  string
	Success bool
	SHA     string // set when Success is true
	Reason  string // set when Success is false
}

// NewSliceTaskSource returns a SliceTaskSource that will hand out the given tasks
// in order. The slice is copied, so later mutation of the argument is ignored.
func NewSliceTaskSource(tasks ...*Task) *SliceTaskSource {
	cp := make([]*Task, len(tasks))
	copy(cp, tasks)
	return &SliceTaskSource{tasks: cp}
}

// Pull returns the next queued task or ErrNoMoreTasks when drained. It also
// honors ctx cancellation.
func (s *SliceTaskSource) Pull(ctx context.Context) (*Task, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.next >= len(s.tasks) {
		return nil, ErrNoMoreTasks
	}
	task := s.tasks[s.next]
	s.next++
	return task, nil
}

// MarkSuccess records a successful, committed task.
func (s *SliceTaskSource) MarkSuccess(_ context.Context, taskID, commitSHA string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Outcomes = append(s.Outcomes, TaskOutcome{TaskID: taskID, Success: true, SHA: commitSHA})
	return nil
}

// MarkFailure records a task that did not land.
func (s *SliceTaskSource) MarkFailure(_ context.Context, taskID, reason string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Outcomes = append(s.Outcomes, TaskOutcome{TaskID: taskID, Success: false, Reason: reason})
	return nil
}

// Successes returns the SHAs recorded for successful tasks, in report order.
func (s *SliceTaskSource) Successes() []TaskOutcome {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]TaskOutcome, 0, len(s.Outcomes))
	for _, o := range s.Outcomes {
		if o.Success {
			out = append(out, o)
		}
	}
	return out
}

// Failures returns the outcomes recorded for failed tasks, in report order.
func (s *SliceTaskSource) Failures() []TaskOutcome {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]TaskOutcome, 0, len(s.Outcomes))
	for _, o := range s.Outcomes {
		if !o.Success {
			out = append(out, o)
		}
	}
	return out
}
