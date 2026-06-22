package fanout

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/lutherfourie/vibe/go/agent"
)

func TestResolveKnownReturnsProvidersAndLabelsInOrder(t *testing.T) {
	providers, labels, err := Resolve([]string{"fake", "grok-cli", "codex"})
	if err != nil {
		t.Fatalf("Resolve known: %v", err)
	}
	if len(providers) != 3 || len(labels) != 3 {
		t.Fatalf("want 3 providers+labels, got %d/%d", len(providers), len(labels))
	}
	if labels[0] != "fake" || labels[1] != "grok-cli" || labels[2] != "codex" {
		t.Fatalf("labels not preserved in order: %v", labels)
	}
	if providers[0].Name() != "fake" {
		t.Fatalf("providers[0].Name() = %q", providers[0].Name())
	}
}

func TestResolveRejectsUnknownAndEmpty(t *testing.T) {
	if _, _, err := Resolve([]string{"fake", "nope"}); err == nil || !strings.Contains(err.Error(), "unknown") {
		t.Fatalf("want unknown-provider error, got %v", err)
	}
	if _, _, err := Resolve(nil); err == nil {
		t.Fatalf("want error for empty provider list")
	}
}

func TestSummarizeMapsFieldsAndLabels(t *testing.T) {
	results := []agent.TurnResult{
		{Provider: "openai", Text: "hello", Usage: agent.Usage{InputTokens: 3, OutputTokens: 5}, Elapsed: 12 * time.Millisecond},
		{Provider: "grok-cli", Err: errors.New("exec: grok not found"), Elapsed: 2 * time.Millisecond},
	}
	// label cerebras over the adapter's "openai" Name to prove labels win.
	s := Summarize(results, []string{"cerebras", "grok-cli"})
	if len(s) != 2 {
		t.Fatalf("want 2 summaries, got %d", len(s))
	}
	if s[0].Provider != "cerebras" {
		t.Fatalf("label not applied: got %q, want cerebras", s[0].Provider)
	}
	if !s[0].OK || s[0].Text != "hello" || s[0].In != 3 || s[0].Out != 5 || s[0].ElapsedMs != 12 {
		t.Fatalf("summary[0] wrong: %+v", s[0])
	}
	if s[1].OK || s[1].Err == "" {
		t.Fatalf("summary[1] should be errored: %+v", s[1])
	}
}

func TestRenderTextAndJSON(t *testing.T) {
	summaries := []Result{
		{Provider: "cerebras", OK: true, Text: "a longer answer", ElapsedMs: 12, In: 3, Out: 5},
		{Provider: "grok-cli", OK: false, Err: "boom", ElapsedMs: 2},
	}

	var text bytes.Buffer
	if err := Render(&text, summaries, "cerebras", false); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"fanout: 2 provider", "[cerebras] ok", "a longer answer", "[grok-cli] ERROR", "boom", "BEST: cerebras"} {
		if !strings.Contains(text.String(), want) {
			t.Fatalf("text render missing %q in:\n%s", want, text.String())
		}
	}

	var js bytes.Buffer
	if err := Render(&js, summaries, "cerebras", true); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"best": "cerebras"`, `"provider": "cerebras"`, `"ok": false`} {
		if !strings.Contains(js.String(), want) {
			t.Fatalf("json render missing %q in:\n%s", want, js.String())
		}
	}
}

func TestSpawnParallelOverFakesThenSummarize(t *testing.T) {
	providers := []agent.Provider{
		agent.FakeProvider{Events: []agent.Event{agent.TextDelta("alpha"), agent.Done()}},
		agent.FakeProvider{Events: []agent.Event{agent.TextDelta("beta beta"), agent.Done()}},
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	results := agent.SpawnParallel(ctx, providers, agent.TurnRequest{Messages: []agent.Message{{Role: agent.RoleUser, Content: "hi"}}})
	s := Summarize(results, []string{"one", "two"})
	if len(s) != 2 || s[0].Text != "alpha" || s[1].Text != "beta beta" {
		t.Fatalf("summaries wrong: %+v", s)
	}
	if s[0].Provider != "one" || s[1].Provider != "two" {
		t.Fatalf("labels not applied: %+v", s)
	}
	if idx, ok := agent.PickBestIndex(results); !ok || idx != 1 {
		t.Fatalf("PickBestIndex want 1 (longer text), got idx=%d ok=%v", idx, ok)
	}
}
