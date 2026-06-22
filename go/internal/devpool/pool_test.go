package devpool

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// --- in-memory fakes (no git, no processes) ---------------------------------

// fakeWorktreeManager hands out unique fake paths and records create/remove.
type fakeWorktreeManager struct {
	mu                 sync.Mutex
	base               string
	creates            []string
	removes            []string
	createErrOnAttempt int // if >0, the Nth create (1-indexed across all tasks) errors
	createCalls        int
}

func (m *fakeWorktreeManager) Create(_ context.Context, taskID, _ string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.createCalls++
	if m.createErrOnAttempt > 0 && m.createCalls == m.createErrOnAttempt {
		return "", errors.New("synthetic worktree create failure")
	}
	p := filepath.Join(m.base, fmt.Sprintf("%s-%d", sanitizeTaskID(taskID), m.createCalls))
	m.creates = append(m.creates, p)
	return p, nil
}

func (m *fakeWorktreeManager) Remove(_ context.Context, path string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.removes = append(m.removes, path)
	return nil
}

func (m *fakeWorktreeManager) Path(taskID string) string {
	return filepath.Join(m.base, sanitizeTaskID(taskID))
}

func (m *fakeWorktreeManager) counts() (creates, removes int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.creates), len(m.removes)
}

// fakeGate returns scripted pass/fail per call.
type fakeGate struct {
	mu       sync.Mutex
	results  []bool // per-call; calls beyond length use defaultPass
	defaultP bool
	calls    int
	err      error
}

func (g *fakeGate) Run(_ context.Context, _ string) (bool, string, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	idx := g.calls
	g.calls++
	if g.err != nil {
		return false, "", g.err
	}
	if idx < len(g.results) {
		return g.results[idx], "fake gate output", nil
	}
	return g.defaultP, "fake gate output", nil
}

func (g *fakeGate) callCount() int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.calls
}

// fakeCommitter records Commit/Discard calls and hands out incrementing SHAs.
type fakeCommitter struct {
	mu           sync.Mutex
	commitCalls  []string // scope-joined, for inspection
	commitScopes [][]string
	discardCalls int
	commitErr    error
	seq          int
}

func (c *fakeCommitter) Commit(_ context.Context, _, _ string, scope []string) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.commitErr != nil {
		return "", c.commitErr
	}
	c.seq++
	cp := append([]string(nil), scope...)
	c.commitScopes = append(c.commitScopes, cp)
	c.commitCalls = append(c.commitCalls, fmt.Sprintf("%v", scope))
	return fmt.Sprintf("sha%d", c.seq), nil
}

func (c *fakeCommitter) Discard(_ context.Context, _ string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.discardCalls++
	return nil
}

func (c *fakeCommitter) commitCount() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.commitCalls)
}

func (c *fakeCommitter) discardCount() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.discardCalls
}

// --- tests ------------------------------------------------------------------

func TestPoolHappyPath(t *testing.T) {
	src := NewSliceTaskSource(&Task{ID: "t1", Description: "do thing", Scope: []string{"src/*.go"}, BaseBranch: "main"})
	wm := &fakeWorktreeManager{base: t.TempDir()}
	gate := &fakeGate{defaultP: true}
	cm := &fakeCommitter{}
	runner := &FakeRunner{Result: "done"}

	pool := NewPool(PoolConfig{Concurrency: 1, MaxAttempts: 1}, src, wm, gate, cm, runner)
	if err := pool.Run(context.Background()); err != nil {
		t.Fatalf("Run: %v", err)
	}

	if got := cm.commitCount(); got != 1 {
		t.Fatalf("expected exactly 1 commit, got %d", got)
	}
	if got := runner.CallCount(); got != 1 {
		t.Fatalf("expected exactly 1 runner call, got %d", got)
	}
	succ := src.Successes()
	if len(succ) != 1 || succ[0].TaskID != "t1" || succ[0].SHA != "sha1" {
		t.Fatalf("expected MarkSuccess(t1, sha1), got %+v", src.Outcomes)
	}
	if len(src.Failures()) != 0 {
		t.Fatalf("expected no failures, got %+v", src.Failures())
	}
	// The committed scope must be exactly the task scope (no -A).
	if len(cm.commitScopes) != 1 || len(cm.commitScopes[0]) != 1 || cm.commitScopes[0][0] != "src/*.go" {
		t.Fatalf("commit scope wrong: %+v", cm.commitScopes)
	}
	// Worktree created and removed once.
	creates, removes := wm.counts()
	if creates != 1 || removes != 1 {
		t.Fatalf("expected 1 create + 1 remove, got %d/%d", creates, removes)
	}
}

func TestPoolGateFailureThenSuccessRetries(t *testing.T) {
	src := NewSliceTaskSource(&Task{ID: "retry", Description: "fix", Scope: []string{"src/**"}, BaseBranch: "main"})
	wm := &fakeWorktreeManager{base: t.TempDir()}
	gate := &fakeGate{results: []bool{false, true}} // fail first, pass second
	cm := &fakeCommitter{}
	runner := &FakeRunner{Result: "ok"}

	pool := NewPool(PoolConfig{Concurrency: 1, MaxAttempts: 2}, src, wm, gate, cm, runner)
	if err := pool.Run(context.Background()); err != nil {
		t.Fatalf("Run: %v", err)
	}

	if got := gate.callCount(); got != 2 {
		t.Fatalf("expected 2 gate attempts, got %d", got)
	}
	if got := cm.commitCount(); got != 1 {
		t.Fatalf("expected exactly 1 commit (after 2nd attempt), got %d", got)
	}
	if got := cm.discardCount(); got != 1 {
		t.Fatalf("expected exactly 1 discard (after failed 1st attempt), got %d", got)
	}
	if got := runner.CallCount(); got != 2 {
		t.Fatalf("expected runner called once per attempt (2), got %d", got)
	}
	if succ := src.Successes(); len(succ) != 1 || succ[0].SHA != "sha1" {
		t.Fatalf("expected one success sha1, got %+v", src.Outcomes)
	}
	// Two attempts => two worktrees created and removed.
	if creates, removes := wm.counts(); creates != 2 || removes != 2 {
		t.Fatalf("expected 2 create + 2 remove, got %d/%d", creates, removes)
	}
}

func TestPoolExhaustsAttemptsThenMarksFailure(t *testing.T) {
	src := NewSliceTaskSource(&Task{ID: "doomed", Description: "nope", Scope: []string{"src/**"}, BaseBranch: "main"})
	wm := &fakeWorktreeManager{base: t.TempDir()}
	gate := &fakeGate{defaultP: false} // always fails
	cm := &fakeCommitter{}
	runner := &FakeRunner{Result: "ok"}

	pool := NewPool(PoolConfig{Concurrency: 1, MaxAttempts: 3}, src, wm, gate, cm, runner)
	if err := pool.Run(context.Background()); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if cm.commitCount() != 0 {
		t.Fatalf("expected no commit on all-fail, got %d", cm.commitCount())
	}
	if gate.callCount() != 3 {
		t.Fatalf("expected 3 gate attempts, got %d", gate.callCount())
	}
	if cm.discardCount() != 3 {
		t.Fatalf("expected 3 discards, got %d", cm.discardCount())
	}
	fails := src.Failures()
	if len(fails) != 1 || fails[0].TaskID != "doomed" {
		t.Fatalf("expected one failure for doomed, got %+v", src.Outcomes)
	}
	if creates, removes := wm.counts(); creates != 3 || removes != 3 {
		t.Fatalf("expected 3 create + 3 remove, got %d/%d", creates, removes)
	}
}

func TestPoolDryRunSkipsRunnerAndCommit(t *testing.T) {
	src := NewSliceTaskSource(
		&Task{ID: "d1", Description: "plan only", Scope: []string{"src/**"}},
		&Task{ID: "d2", Description: "plan only too", Scope: []string{"src/**"}},
	)
	wm := &fakeWorktreeManager{base: t.TempDir()}
	gate := &fakeGate{defaultP: true}
	cm := &fakeCommitter{}
	runner := &FakeRunner{Result: "should not run"}

	pool := NewPool(PoolConfig{Concurrency: 2, MaxAttempts: 2, DryRun: true}, src, wm, gate, cm, runner)
	if err := pool.Run(context.Background()); err != nil {
		t.Fatalf("Run: %v", err)
	}

	if runner.CallCount() != 0 {
		t.Fatalf("dry-run must not call runner, got %d calls", runner.CallCount())
	}
	if cm.commitCount() != 0 {
		t.Fatalf("dry-run must not commit, got %d", cm.commitCount())
	}
	if gate.callCount() != 0 {
		t.Fatalf("dry-run must not run gate, got %d", gate.callCount())
	}
	if creates, _ := wm.counts(); creates != 0 {
		t.Fatalf("dry-run must not create worktrees, got %d", creates)
	}
	succ := src.Successes()
	if len(succ) != 2 {
		t.Fatalf("expected 2 dry-run successes, got %d (%+v)", len(succ), src.Outcomes)
	}
	for _, s := range succ {
		if s.SHA != DryRunSHA {
			t.Fatalf("dry-run success should carry DryRunSHA marker, got %q", s.SHA)
		}
	}
}

// blockingSource yields one task then blocks until ctx is done OR the test
// signals via release. It lets us prove the STOP sentinel halts new pulls while
// in-flight work continues.
type blockingSource struct {
	mu       sync.Mutex
	handed   bool
	outcomes []TaskOutcome
	pulls    int32
}

func (s *blockingSource) Pull(ctx context.Context) (*Task, error) {
	atomic.AddInt32(&s.pulls, 1)
	s.mu.Lock()
	if !s.handed {
		s.handed = true
		s.mu.Unlock()
		return &Task{ID: "first", Description: "go", Scope: []string{"src/**"}, BaseBranch: "main"}, nil
	}
	s.mu.Unlock()
	// After the first task, block until cancellation (simulating "waiting for more
	// work"). The pool should stop pulling once the sentinel appears and never
	// reach here a second time in a way that hangs Run.
	<-ctx.Done()
	return nil, ctx.Err()
}

func (s *blockingSource) MarkSuccess(_ context.Context, id, sha string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.outcomes = append(s.outcomes, TaskOutcome{TaskID: id, Success: true, SHA: sha})
	return nil
}

func (s *blockingSource) MarkFailure(_ context.Context, id, reason string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.outcomes = append(s.outcomes, TaskOutcome{TaskID: id, Success: false, Reason: reason})
	return nil
}

func TestPoolStopSentinelDrainsAndExits(t *testing.T) {
	sentinel := filepath.Join(t.TempDir(), "STOP")
	src := &blockingSource{}
	wm := &fakeWorktreeManager{base: t.TempDir()}
	gate := &fakeGate{defaultP: true}
	cm := &fakeCommitter{}
	runner := &FakeRunner{Result: "ok"}

	pool := NewPool(PoolConfig{
		Concurrency:  1,
		MaxAttempts:  1,
		StopSentinel: sentinel,
		PollInterval: 10 * time.Millisecond,
	}, src, wm, gate, cm, runner)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	done := make(chan error, 1)
	go func() { done <- pool.Run(ctx) }()

	// Let the first task land, then drop the sentinel to halt new pulls.
	deadline := time.Now().Add(2 * time.Second)
	for cm.commitCount() == 0 {
		if time.Now().After(deadline) {
			t.Fatalf("first task never committed")
		}
		time.Sleep(5 * time.Millisecond)
	}
	writeFile(t, sentinel, "stop\n")

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Run should exit cleanly on sentinel, got %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatalf("pool did not drain/exit after sentinel appeared")
	}

	if cm.commitCount() != 1 {
		t.Fatalf("expected the in-flight task to finish (1 commit), got %d", cm.commitCount())
	}
}

func TestPoolStopMethodHaltsPulls(t *testing.T) {
	src := &blockingSource{}
	wm := &fakeWorktreeManager{base: t.TempDir()}
	pool := NewPool(PoolConfig{Concurrency: 1, MaxAttempts: 1},
		src, wm, &fakeGate{defaultP: true}, &fakeCommitter{}, &FakeRunner{Result: "ok"})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- pool.Run(ctx) }()

	// Wait for the first task to be handed out, then Stop().
	deadline := time.Now().Add(2 * time.Second)
	for atomic.LoadInt32(&src.pulls) == 0 {
		if time.Now().After(deadline) {
			t.Fatalf("source never pulled")
		}
		time.Sleep(5 * time.Millisecond)
	}
	pool.Stop()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Run should exit cleanly after Stop, got %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatalf("pool did not exit after Stop()")
	}
}

func TestPoolContextCancellationStops(t *testing.T) {
	src := &blockingSource{}
	wm := &fakeWorktreeManager{base: t.TempDir()}
	pool := NewPool(PoolConfig{Concurrency: 1, MaxAttempts: 1},
		src, wm, &fakeGate{defaultP: true}, &fakeCommitter{}, &FakeRunner{Result: "ok"})

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- pool.Run(ctx) }()

	deadline := time.Now().Add(2 * time.Second)
	for atomic.LoadInt32(&src.pulls) == 0 {
		if time.Now().After(deadline) {
			t.Fatalf("source never pulled")
		}
		time.Sleep(5 * time.Millisecond)
	}
	cancel()

	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("expected context.Canceled from Run, got %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatalf("pool did not exit on context cancellation")
	}
}

// concurrencyProbeGate tracks the live number of concurrently-running gate calls
// and records the peak, so the test can assert the semaphore bound.
type concurrencyProbeGate struct {
	live int32
	peak int32
	hold time.Duration
}

func (g *concurrencyProbeGate) Run(_ context.Context, _ string) (bool, string, error) {
	n := atomic.AddInt32(&g.live, 1)
	for {
		p := atomic.LoadInt32(&g.peak)
		if n <= p || atomic.CompareAndSwapInt32(&g.peak, p, n) {
			break
		}
	}
	time.Sleep(g.hold) // hold the slot so overlap is observable
	atomic.AddInt32(&g.live, -1)
	return true, "", nil
}

func TestPoolRespectsConcurrencyBound(t *testing.T) {
	const (
		numTasks    = 24
		concurrency = 4
	)
	tasks := make([]*Task, numTasks)
	for i := range tasks {
		tasks[i] = &Task{ID: fmt.Sprintf("t%d", i), Description: "x", Scope: []string{"src/**"}, BaseBranch: "main"}
	}
	src := NewSliceTaskSource(tasks...)
	wm := &fakeWorktreeManager{base: t.TempDir()}
	gate := &concurrencyProbeGate{hold: 15 * time.Millisecond}
	cm := &fakeCommitter{}
	runner := &FakeRunner{Result: "ok"}

	pool := NewPool(PoolConfig{Concurrency: concurrency, MaxAttempts: 1}, src, wm, gate, cm, runner)
	if err := pool.Run(context.Background()); err != nil {
		t.Fatalf("Run: %v", err)
	}

	if peak := atomic.LoadInt32(&gate.peak); peak > concurrency {
		t.Fatalf("concurrency bound violated: peak %d > limit %d", peak, concurrency)
	}
	if peak := atomic.LoadInt32(&gate.peak); peak < 2 {
		t.Fatalf("expected some real parallelism (peak >= 2), got %d", peak)
	}
	if cm.commitCount() != numTasks {
		t.Fatalf("expected %d commits, got %d", numTasks, cm.commitCount())
	}
	if len(src.Successes()) != numTasks {
		t.Fatalf("expected %d successes, got %d", numTasks, len(src.Successes()))
	}
}

func TestPoolWorktreeCreateFailureMarksFailure(t *testing.T) {
	src := NewSliceTaskSource(&Task{ID: "wtfail", Description: "x", Scope: []string{"src/**"}, BaseBranch: "main"})
	wm := &fakeWorktreeManager{base: t.TempDir(), createErrOnAttempt: 1}
	pool := NewPool(PoolConfig{Concurrency: 1, MaxAttempts: 1},
		src, wm, &fakeGate{defaultP: true}, &fakeCommitter{}, &FakeRunner{Result: "ok"})
	if err := pool.Run(context.Background()); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(src.Failures()) != 1 {
		t.Fatalf("expected 1 failure when worktree create fails, got %+v", src.Outcomes)
	}
}
