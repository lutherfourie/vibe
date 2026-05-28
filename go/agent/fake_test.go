package agent

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestFakeProviderDefaultEchoesLastUserMessage(t *testing.T) {
	provider := FakeProvider{}
	req := TurnRequest{
		Messages: []Message{
			{Role: RoleSystem, Content: "Be terse."},
			{Role: RoleUser, Content: "first"},
			{Role: RoleAssistant, Content: "ok"},
			{Role: RoleUser, Content: "hello from vibe"},
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	ch, err := provider.RunTurn(ctx, req)
	if err != nil {
		t.Fatalf("RunTurn returned error: %v", err)
	}
	events := collectEvents(t, ch)

	if len(events) < 3 {
		t.Fatalf("expected text, usage, and done events, got %d", len(events))
	}
	var text strings.Builder
	for i, event := range events[:len(events)-2] {
		if event.Kind != EventKindTextDelta {
			t.Fatalf("event %d kind = %q, want %q", i, event.Kind, EventKindTextDelta)
		}
		text.WriteString(event.Text)
	}
	if got, want := text.String(), "hello from vibe"; got != want {
		t.Fatalf("assembled text = %q, want %q", got, want)
	}

	usage := events[len(events)-2]
	if usage.Kind != EventKindUsage {
		t.Fatalf("penultimate event kind = %q, want %q", usage.Kind, EventKindUsage)
	}
	if usage.Usage == nil {
		t.Fatal("usage payload is nil")
	}
	if *usage.Usage != (Usage{}) {
		t.Fatalf("usage = %+v, want zero usage", *usage.Usage)
	}

	done := events[len(events)-1]
	if done.Kind != EventKindDone {
		t.Fatalf("last event kind = %q, want %q", done.Kind, EventKindDone)
	}
}

func TestFakeProviderScriptAppendsDoneWhenMissingTerminalEvent(t *testing.T) {
	provider := FakeProvider{
		Events: []Event{TextDelta("scripted")},
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	ch, err := provider.RunTurn(ctx, TurnRequest{})
	if err != nil {
		t.Fatalf("RunTurn returned error: %v", err)
	}
	events := collectEvents(t, ch)

	if got, want := len(events), 2; got != want {
		t.Fatalf("event count = %d, want %d", got, want)
	}
	if events[0].Kind != EventKindTextDelta || events[0].Text != "scripted" {
		t.Fatalf("first event = %+v, want scripted text delta", events[0])
	}
	if events[1].Kind != EventKindDone {
		t.Fatalf("last event kind = %q, want %q", events[1].Kind, EventKindDone)
	}
}

func TestFakeProviderCancellationStopsEmissionEarly(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	provider := FakeProvider{
		Events: []Event{
			TextDelta("first"),
			TextDelta("second"),
			UsageEvent(Usage{}),
			Done(),
		},
	}

	ch, err := provider.RunTurn(ctx, TurnRequest{})
	if err != nil {
		t.Fatalf("RunTurn returned error: %v", err)
	}

	first, ok := <-ch
	if !ok {
		t.Fatal("channel closed before first event")
	}
	if first.Kind != EventKindTextDelta || first.Text != "first" {
		t.Fatalf("first event = %+v, want first text delta", first)
	}

	cancel()
	remaining := collectEvents(t, ch)
	if len(remaining) > 1 {
		t.Fatalf("expected at most one terminal cancellation event, got %+v", remaining)
	}
	if len(remaining) == 1 && remaining[0].Kind != EventKindError {
		t.Fatalf("remaining event kind = %q, want %q", remaining[0].Kind, EventKindError)
	}
	for _, event := range remaining {
		if event.Kind == EventKindTextDelta && event.Text == "second" {
			t.Fatalf("provider emitted scripted event after cancellation: %+v", remaining)
		}
	}
}

func collectEvents(t *testing.T, ch <-chan Event) []Event {
	t.Helper()

	done := make(chan []Event, 1)
	go func() {
		var events []Event
		for event := range ch {
			events = append(events, event)
		}
		done <- events
	}()

	select {
	case events := <-done:
		return events
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for event channel to close")
	}
	return nil
}
