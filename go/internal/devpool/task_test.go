package devpool

import (
	"context"
	"errors"
	"testing"

	"github.com/lutherfourie/vibe/go/agent"
)

func TestSliceTaskSourceDrainsInOrder(t *testing.T) {
	src := NewSliceTaskSource(
		&Task{ID: "a"},
		&Task{ID: "b"},
	)
	ctx := context.Background()

	first, err := src.Pull(ctx)
	if err != nil || first.ID != "a" {
		t.Fatalf("first pull: id=%v err=%v", first, err)
	}
	second, err := src.Pull(ctx)
	if err != nil || second.ID != "b" {
		t.Fatalf("second pull: id=%v err=%v", second, err)
	}
	if _, err := src.Pull(ctx); !errors.Is(err, ErrNoMoreTasks) {
		t.Fatalf("expected ErrNoMoreTasks when drained, got %v", err)
	}
}

func TestSliceTaskSourceRecordsOutcomes(t *testing.T) {
	src := NewSliceTaskSource(&Task{ID: "x"})
	ctx := context.Background()
	if err := src.MarkSuccess(ctx, "x", "deadbeef"); err != nil {
		t.Fatal(err)
	}
	if err := src.MarkFailure(ctx, "y", "boom"); err != nil {
		t.Fatal(err)
	}
	if s := src.Successes(); len(s) != 1 || s[0].SHA != "deadbeef" {
		t.Fatalf("successes wrong: %+v", s)
	}
	if f := src.Failures(); len(f) != 1 || f[0].Reason != "boom" {
		t.Fatalf("failures wrong: %+v", f)
	}
}

func TestSliceTaskSourceHonorsCanceledContext(t *testing.T) {
	src := NewSliceTaskSource(&Task{ID: "a"})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := src.Pull(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got %v", err)
	}
}

// TestProviderRunnerOverFakeProvider exercises the ProviderRunner adapter using
// ONLY agent.FakeProvider — no real CLI/process is spawned (per the ADR's
// supervised-first-use rail).
func TestProviderRunnerOverFakeProvider(t *testing.T) {
	pr := ProviderRunner{
		Provider: agent.FakeProvider{Events: []agent.Event{agent.TextDelta("edited"), agent.Done()}},
	}
	out, err := pr.Run(context.Background(), "/some/worktree", "make the change")
	if err != nil {
		t.Fatalf("ProviderRunner.Run: %v", err)
	}
	if out != "edited" {
		t.Fatalf("expected assembled text 'edited', got %q", out)
	}
}

func TestProviderRunnerSurfacesProviderError(t *testing.T) {
	pr := ProviderRunner{
		Provider: agent.FakeProvider{Events: []agent.Event{agent.ErrorEvent("kaboom")}},
	}
	if _, err := pr.Run(context.Background(), "/wt", "x"); err == nil {
		t.Fatalf("expected error surfaced from provider")
	}
}

func TestFakeRunnerScriptsPerAttempt(t *testing.T) {
	r := &FakeRunner{
		ResultsByAttempt: []RunnerResult{
			{Err: errors.New("first fails")},
			{Text: "second ok"},
		},
		Result: "fallback",
	}
	ctx := context.Background()
	if _, err := r.Run(ctx, "wt", "p"); err == nil {
		t.Fatalf("attempt 1 should error")
	}
	if got, err := r.Run(ctx, "wt", "p"); err != nil || got != "second ok" {
		t.Fatalf("attempt 2 wrong: got=%q err=%v", got, err)
	}
	if got, _ := r.Run(ctx, "wt", "p"); got != "fallback" {
		t.Fatalf("attempt 3 should fall back, got %q", got)
	}
	if r.CallCount() != 3 {
		t.Fatalf("expected 3 calls, got %d", r.CallCount())
	}
	if calls := r.Calls(); len(calls) != 3 || calls[0].WorktreeDir != "wt" || calls[0].Prompt != "p" {
		t.Fatalf("recorded calls wrong: %+v", calls)
	}
}
