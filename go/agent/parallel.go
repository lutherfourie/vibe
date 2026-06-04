package agent

import (
	"context"
	"errors"
	"sync"
	"time"
)

// TurnResult is the collected outcome of one provider running a TurnRequest:
// the assembled text, the full event stream, accumulated usage, tool-call count,
// any error, and wall-clock time. It is what a parallel fan-out yields per provider.
type TurnResult struct {
	Provider  string
	Text      string
	Events    []Event
	Usage     Usage
	ToolCalls int
	Err       error
	Elapsed   time.Duration
}

// CollectTurn runs a single provider's turn to completion and assembles the
// streamed events into a TurnResult. The event channel is always fully drained.
// A RunTurn error or a terminal error event is captured in Err (it does not panic
// or leak the goroutine). Honors ctx cancellation via the provider.
func CollectTurn(ctx context.Context, p Provider, req TurnRequest) TurnResult {
	start := time.Now()
	res := TurnResult{}
	if p == nil {
		res.Err = errors.New("nil provider")
		res.Elapsed = time.Since(start)
		return res
	}
	res.Provider = p.Name()

	ch, err := p.RunTurn(ctx, req)
	if err != nil {
		res.Err = err
		res.Elapsed = time.Since(start)
		return res
	}
	for ev := range ch {
		res.Events = append(res.Events, ev)
		switch ev.Kind {
		case EventKindTextDelta:
			res.Text += ev.Text
		case EventKindToolCall:
			res.ToolCalls++
		case EventKindUsage:
			if ev.Usage != nil {
				res.Usage.InputTokens += ev.Usage.InputTokens
				res.Usage.OutputTokens += ev.Usage.OutputTokens
				res.Usage.CostUSD += ev.Usage.CostUSD
			}
		case EventKindError:
			if res.Err == nil {
				res.Err = errors.New(ev.Err)
			}
		}
	}
	res.Elapsed = time.Since(start)
	return res
}

// SpawnParallel runs the SAME TurnRequest across every provider concurrently and
// returns one TurnResult per provider, in input order. It waits for all providers
// (each observes ctx cancellation). This is the M2 fan-out primitive — e.g.
// SpawnParallel(ctx, []Provider{cerebras, grok}, req) runs Cerebras GLM and Grok
// side by side. Use PickBest (or your own selector) to choose/merge the winner.
//
// A nil/empty provider slice yields an empty result set. Individual provider
// failures are captured per-result and never abort the others.
func SpawnParallel(ctx context.Context, providers []Provider, req TurnRequest) []TurnResult {
	results := make([]TurnResult, len(providers))
	if len(providers) == 0 {
		return results
	}
	var wg sync.WaitGroup
	for i := range providers {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i] = CollectTurn(ctx, providers[i], req)
		}(i)
	}
	wg.Wait()
	return results
}

// PickBest selects the strongest result from a fan-out using a sensible default
// heuristic: error-free results beat errored ones; among those, more assembled
// text (more complete output) wins; ties break toward the faster provider.
// Returns ok=false for an empty/all-nil set. Callers that need different
// semantics (best-of-N by a judge, schema-merge, first-to-finish) can inspect
// the []TurnResult directly.
func PickBest(results []TurnResult) (TurnResult, bool) {
	best := -1
	for i := range results {
		if best == -1 || resultBetter(results[i], results[best]) {
			best = i
		}
	}
	if best == -1 {
		return TurnResult{}, false
	}
	return results[best], true
}

func resultBetter(a, b TurnResult) bool {
	aOK, bOK := a.Err == nil, b.Err == nil
	if aOK != bOK {
		return aOK // an error-free turn always beats an errored one
	}
	if len(a.Text) != len(b.Text) {
		return len(a.Text) > len(b.Text) // more complete output
	}
	return a.Elapsed < b.Elapsed // tie-break on speed
}
