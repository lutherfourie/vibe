package devpool

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"
)

// DryRunSHA is the synthetic commit marker recorded as the "SHA" when a task is
// processed in dry-run mode (no subagent, no gate, no commit).
const DryRunSHA = "dry-run"

const defaultPollInterval = 500 * time.Millisecond

// worktreeRemoveTimeout bounds the detached cleanup of a worktree so a hung git
// process cannot wedge a worker during shutdown.
const worktreeRemoveTimeout = 30 * time.Second

// PoolConfig configures the development pool.
type PoolConfig struct {
	// Concurrency is the maximum number of tasks processed at once. Values < 1
	// are treated as 1.
	Concurrency int
	// MaxAttempts is the number of gate attempts per task before it is marked a
	// failure. Each attempt is a fresh worktree. Values < 1 are treated as 1.
	MaxAttempts int
	// DryRun, when true, plans the flow without running the subagent, gate, or
	// committer: each pulled task is reported via MarkSuccess with DryRunSHA.
	DryRun bool
	// StopSentinel is a file path; when it exists, the pool stops pulling NEW
	// tasks (in-flight tasks still finish). Empty disables the sentinel.
	StopSentinel string
	// PollInterval bounds how long the feeder sleeps before retrying after a
	// transient Pull error. Defaults to 500ms.
	PollInterval time.Duration
}

func (c PoolConfig) concurrency() int {
	if c.Concurrency < 1 {
		return 1
	}
	return c.Concurrency
}

func (c PoolConfig) maxAttempts() int {
	if c.MaxAttempts < 1 {
		return 1
	}
	return c.MaxAttempts
}

func (c PoolConfig) pollInterval() time.Duration {
	if c.PollInterval <= 0 {
		return defaultPollInterval
	}
	return c.PollInterval
}

// Pool orchestrates the continuous, gated, worktree-isolated dev loop. Construct
// it with NewPool and drive it with Run.
type Pool struct {
	config    PoolConfig
	source    TaskSource
	wm        WorktreeManager
	gate      Gate
	committer Committer
	runner    SubagentRunner

	// CommitMessage builds the commit message for a task. Nil uses defaultMessage.
	CommitMessage func(t *Task) string

	stopOnce sync.Once
	stopCh   chan struct{}
}

// NewPool wires the pool's collaborators. In DryRun mode the gate, runner, and
// committer are never invoked, so they may be nil; otherwise all are required.
func NewPool(cfg PoolConfig, src TaskSource, wm WorktreeManager, g Gate, c Committer, r SubagentRunner) *Pool {
	return &Pool{
		config:    cfg,
		source:    src,
		wm:        wm,
		gate:      g,
		committer: c,
		runner:    r,
		stopCh:    make(chan struct{}),
	}
}

// Stop asks the pool to stop pulling new tasks and drain. In-flight tasks still
// finish. It is safe to call more than once and from any goroutine.
func (p *Pool) Stop() {
	p.stopOnce.Do(func() { close(p.stopCh) })
}

// Run drives the pool until the backlog drains (ErrNoMoreTasks), the STOP signal
// fires (sentinel file or Stop()), or ctx is canceled. It pulls tasks serially
// and dispatches each to a worker bounded by Concurrency, then blocks until all
// in-flight workers finish.
//
// On a STOP signal (sentinel file or Stop()), the pool stops pulling NEW tasks
// and lets in-flight tasks finish: workers run under the caller's ctx, which a
// stop does not cancel. Only cancellation of the caller's ctx aborts in-flight
// work; in that case Run returns ctx.Err(). A clean drain or stop returns nil.
//
// A blocked TaskSource.Pull is unblocked on stop because Pull receives an
// internal pull context that the pool cancels when the stop signal fires.
func (p *Pool) Run(ctx context.Context) error {
	// pullCtx is canceled when the pool should stop pulling NEW work: parent ctx
	// done, Stop() called, or the STOP sentinel appears. Workers do NOT use it —
	// they use the caller's ctx so a stop lets them finish.
	pullCtx, cancelPull := context.WithCancel(ctx)
	defer cancelPull()

	// quit lets Run tell the stop-watcher to exit on a clean drain (where neither
	// ctx nor stopCh fires), so the watcher goroutine never leaks.
	quit := make(chan struct{})
	watcherDone := make(chan struct{})
	go p.watchStop(ctx, quit, cancelPull, watcherDone)
	defer func() {
		close(quit)
		<-watcherDone
	}()

	sem := make(chan struct{}, p.config.concurrency())
	var wg sync.WaitGroup

feed:
	for {
		// Stop pulling NEW work on cancellation or any stop signal, then fall
		// through to wg.Wait so in-flight tasks finish.
		if pullCtx.Err() != nil {
			break feed
		}

		task, err := p.source.Pull(pullCtx)
		if err != nil {
			if errors.Is(err, ErrNoMoreTasks) {
				break feed
			}
			if pullCtx.Err() != nil {
				// We were asked to stop (or parent canceled); Pull returned its
				// context error. Stop pulling; the parent-ctx check after the loop
				// decides the return value.
				break feed
			}
			// Transient source error: back off briefly, re-checking stop/ctx.
			select {
			case <-pullCtx.Done():
				break feed
			case <-time.After(p.config.pollInterval()):
				continue feed
			}
		}
		if task == nil {
			continue feed
		}

		// Acquire a worker slot (bounded concurrency), honoring stop/ctx so we
		// never block forever when shutting down.
		select {
		case sem <- struct{}{}:
		case <-pullCtx.Done():
			break feed
		}

		wg.Add(1)
		go func(t *Task) {
			defer wg.Done()
			defer func() { <-sem }()
			p.processTask(ctx, t)
		}(task)
	}

	wg.Wait()
	// Only a canceled CALLER context is a Run error; a deliberate stop is clean.
	return ctx.Err()
}

// watchStop cancels the pull context when the pool should stop accepting new
// tasks: the caller's ctx is canceled, Stop() is called, or (when configured) the
// STOP sentinel file appears. It also returns when quit is closed (Run finished a
// clean drain), so the goroutine never leaks. When no sentinel is configured it
// simply waits on those signals; with a sentinel it additionally polls at
// PollInterval. It always closes done and cancels pullCtx on its way out.
func (p *Pool) watchStop(ctx context.Context, quit <-chan struct{}, cancelPull context.CancelFunc, done chan<- struct{}) {
	defer close(done)
	defer cancelPull()

	if strings.TrimSpace(p.config.StopSentinel) == "" {
		select {
		case <-ctx.Done():
		case <-p.stopCh:
		case <-quit:
		}
		return
	}

	ticker := time.NewTicker(p.config.pollInterval())
	defer ticker.Stop()
	for {
		if p.sentinelPresent() {
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-p.stopCh:
			return
		case <-quit:
			return
		case <-ticker.C:
		}
	}
}

// processTask runs one task through up to MaxAttempts isolated attempts. Each
// attempt: create worktree -> (unless DryRun) run subagent -> run gate -> commit
// on green, discard on red -> ALWAYS remove the worktree for that attempt. On the
// first green commit it records MarkSuccess and returns; if every attempt fails
// it records MarkFailure.
func (p *Pool) processTask(ctx context.Context, task *Task) {
	if p.config.DryRun {
		// Plan-only: no worktree, no subagent, no gate, no commit.
		_ = p.source.MarkSuccess(ctx, task.ID, DryRunSHA)
		return
	}

	var lastReason string
	attempts := p.config.maxAttempts()
	for attempt := 1; attempt <= attempts; attempt++ {
		if err := ctx.Err(); err != nil {
			_ = p.source.MarkFailure(ctx, task.ID, "canceled: "+err.Error())
			return
		}

		reason, committedSHA, done := p.runAttempt(ctx, task, attempt)
		if done {
			_ = p.source.MarkSuccess(ctx, task.ID, committedSHA)
			return
		}
		lastReason = reason
	}

	if lastReason == "" {
		lastReason = "all attempts failed gate"
	}
	_ = p.source.MarkFailure(ctx, task.ID, lastReason)
}

// runAttempt performs a single isolated attempt. It returns done=true with the
// SHA on a successful commit; otherwise done=false and a human-readable reason
// describing why the attempt did not land. The worktree is always removed before
// returning, regardless of outcome (this is the bug-fix for the cerebras draft's
// defer-in-loop: cleanup is explicit and per-attempt, not deferred to function
// return where it would stack and run in the wrong order).
func (p *Pool) runAttempt(ctx context.Context, task *Task, attempt int) (reason string, sha string, done bool) {
	wtPath, err := p.wm.Create(ctx, task.ID, task.BaseBranch)
	if err != nil {
		return fmt.Sprintf("attempt %d: worktree create failed: %v", attempt, err), "", false
	}
	// Explicit per-attempt cleanup. Using a closure deferred within THIS function
	// (not the loop) guarantees the worktree is gone before the next attempt's
	// Create runs for the same task ID. Cleanup runs on a detached context with a
	// short timeout so a canceled parent ctx cannot leave a zombie worktree behind
	// (the cerebras draft deferred Remove(ctx, ...) inside the loop, which both
	// stacked cleanups and would no-op once ctx was canceled).
	defer func() {
		rmCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), worktreeRemoveTimeout)
		defer cancel()
		_ = p.wm.Remove(rmCtx, wtPath)
	}()

	if _, err := p.runner.Run(ctx, wtPath, task.Description); err != nil {
		return fmt.Sprintf("attempt %d: subagent failed: %v", attempt, err), "", false
	}

	passed, output, err := p.gate.Run(ctx, wtPath)
	if err != nil {
		return fmt.Sprintf("attempt %d: gate error: %v", attempt, err), "", false
	}
	if !passed {
		// Leave nothing behind even though the worktree is about to be removed —
		// matches the explicit-discard contract from .autodev/loop.ps1.
		_ = p.committer.Discard(ctx, wtPath)
		return fmt.Sprintf("attempt %d: gate failed%s", attempt, gateTail(output)), "", false
	}

	commitSHA, err := p.committer.Commit(ctx, wtPath, p.commitMessage(task), task.Scope)
	if err != nil {
		return fmt.Sprintf("attempt %d: commit failed: %v", attempt, err), "", false
	}
	return "", commitSHA, true
}

func (p *Pool) commitMessage(task *Task) string {
	if p.CommitMessage != nil {
		return p.CommitMessage(task)
	}
	return defaultMessage(task)
}

func defaultMessage(task *Task) string {
	desc := strings.TrimSpace(task.Description)
	if desc == "" {
		desc = task.ID
	}
	// Keep the subject to a single line; git is happiest that way.
	if idx := strings.IndexByte(desc, '\n'); idx >= 0 {
		desc = strings.TrimSpace(desc[:idx])
	}
	return desc
}

func (p *Pool) sentinelPresent() bool {
	path := strings.TrimSpace(p.config.StopSentinel)
	if path == "" {
		return false
	}
	_, err := os.Stat(path)
	return err == nil
}

// gateTail returns a short, single-line tail of gate output for the failure
// reason, or "" when there is none.
func gateTail(output string) string {
	out := strings.TrimSpace(output)
	if out == "" {
		return ""
	}
	const max = 200
	if len(out) > max {
		out = out[len(out)-max:]
	}
	out = strings.ReplaceAll(out, "\n", " ")
	return ": " + out
}
