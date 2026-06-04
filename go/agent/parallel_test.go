package agent

import (
	"context"
	"errors"
	"testing"
	"time"
)

// runTurnErrProvider returns an error from RunTurn itself (not via an event),
// exercising the early-error branch of CollectTurn/SpawnParallel.
type runTurnErrProvider struct{ name string }

func (p runTurnErrProvider) Name() string { return p.name }
func (p runTurnErrProvider) RunTurn(context.Context, TurnRequest) (<-chan Event, error) {
	return nil, errors.New("runturn failed")
}

func TestSpawnParallelCollectsEveryProviderInOrder(t *testing.T) {
	providers := []Provider{
		FakeProvider{Events: []Event{TextDelta("alpha"), UsageEvent(Usage{OutputTokens: 1}), Done()}},
		FakeProvider{Events: []Event{TextDelta("bravo bravo"), UsageEvent(Usage{OutputTokens: 2}), Done()}},
		FakeProvider{Events: []Event{ErrorEvent("boom")}}, // terminal error event
		runTurnErrProvider{name: "rterr"},                  // RunTurn() returns error
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	results := SpawnParallel(ctx, providers, TurnRequest{Messages: []Message{{Role: RoleUser, Content: "hi"}}})

	if len(results) != 4 {
		t.Fatalf("want 4 results, got %d", len(results))
	}
	if results[0].Text != "alpha" || results[1].Text != "bravo bravo" {
		t.Fatalf("order/text mismatch: %q / %q", results[0].Text, results[1].Text)
	}
	if results[0].Err != nil || results[1].Err != nil {
		t.Fatalf("providers 0/1 should be error-free: %v / %v", results[0].Err, results[1].Err)
	}
	if results[0].Usage.OutputTokens != 1 || results[1].Usage.OutputTokens != 2 {
		t.Fatalf("usage not accumulated: %d / %d", results[0].Usage.OutputTokens, results[1].Usage.OutputTokens)
	}
	if results[2].Err == nil {
		t.Fatalf("provider 2 (error event) should report Err")
	}
	if results[3].Err == nil || results[3].Provider != "rterr" {
		t.Fatalf("provider 3 (RunTurn error) should report Err, name=%q err=%v", results[3].Provider, results[3].Err)
	}
}

func TestSpawnParallelEmpty(t *testing.T) {
	if got := SpawnParallel(context.Background(), nil, TurnRequest{}); len(got) != 0 {
		t.Fatalf("nil providers should yield empty results, got %d", len(got))
	}
}

func TestSpawnParallelRunsConcurrently(t *testing.T) {
	// Three providers that each only complete after a delay; total wall time must
	// be far less than the sum if they truly run in parallel.
	const delay = 60 * time.Millisecond
	providers := []Provider{slowProvider{delay}, slowProvider{delay}, slowProvider{delay}}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	start := time.Now()
	results := SpawnParallel(ctx, providers, TurnRequest{})
	elapsed := time.Since(start)

	if len(results) != 3 {
		t.Fatalf("want 3 results, got %d", len(results))
	}
	if elapsed >= 3*delay {
		t.Fatalf("expected concurrent (<%v), took %v (looks serial)", 3*delay, elapsed)
	}
}

type slowProvider struct{ d time.Duration }

func (slowProvider) Name() string { return "slow" }
func (p slowProvider) RunTurn(ctx context.Context, _ TurnRequest) (<-chan Event, error) {
	out := make(chan Event, 2)
	go func() {
		defer close(out)
		select {
		case <-ctx.Done():
			out <- ErrorEvent(ctx.Err().Error())
		case <-time.After(p.d):
			out <- TextDelta("ok")
			out <- Done()
		}
	}()
	return out, nil
}

func TestPickBestPrefersErrorFreeThenMoreText(t *testing.T) {
	results := []TurnResult{
		{Provider: "short", Text: "short", Elapsed: 5 * time.Millisecond},
		{Provider: "long", Text: "a much longer, more complete answer", Elapsed: 9 * time.Millisecond},
		{Provider: "errored", Text: "errored but very very long text here", Err: errors.New("x"), Elapsed: time.Millisecond},
	}
	best, ok := PickBest(results)
	if !ok || best.Provider != "long" {
		t.Fatalf("want best=long, got ok=%v provider=%q", ok, best.Provider)
	}
}

func TestPickBestTieBreaksOnSpeed(t *testing.T) {
	results := []TurnResult{
		{Provider: "slow", Text: "same", Elapsed: 20 * time.Millisecond},
		{Provider: "fast", Text: "same", Elapsed: 3 * time.Millisecond},
	}
	best, ok := PickBest(results)
	if !ok || best.Provider != "fast" {
		t.Fatalf("want best=fast, got ok=%v provider=%q", ok, best.Provider)
	}
}

func TestPickBestEmpty(t *testing.T) {
	if _, ok := PickBest(nil); ok {
		t.Fatalf("empty results should yield ok=false")
	}
}
