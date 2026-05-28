package codex

import (
	"context"
	"errors"
	"io"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/lutherfourie/vibe/go/agent"
)

func TestProviderRunTurnEmitsTrimmedStdoutThenDone(t *testing.T) {
	runner := &fakeRunner{stdout: "\nhello from codex\n\n"}
	provider := NewWithRunner(runner)
	req := agent.TurnRequest{
		Messages: []agent.Message{
			{Role: agent.RoleSystem, Content: "Be concise."},
			{Role: agent.RoleUser, Content: "Summarize the repo."},
			{Role: agent.RoleAssistant, Content: "I can do that."},
			{Role: agent.RoleTool, Content: "tool output"},
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	ch, err := provider.RunTurn(ctx, req)
	if err != nil {
		t.Fatalf("RunTurn returned error: %v", err)
	}
	events := collectEvents(t, ch)

	if got, want := provider.Name(), "codex"; got != want {
		t.Fatalf("Name() = %q, want %q", got, want)
	}
	wantPrompt := "system:\nBe concise.\n\nuser:\nSummarize the repo.\n\nassistant:\nI can do that.\n\ntool:\ntool output"
	wantArgs := []string{"exec", "--sandbox", "read-only", "--skip-git-repo-check", wantPrompt}
	if !reflect.DeepEqual(runner.args, wantArgs) {
		t.Fatalf("runner args = %#v, want %#v", runner.args, wantArgs)
	}
	if runner.stdin != "" {
		t.Fatalf("runner stdin = %q, want empty", runner.stdin)
	}
	if got, want := len(events), 2; got != want {
		t.Fatalf("event count = %d, want %d: %+v", got, want, events)
	}
	if events[0].Kind != agent.EventKindTextDelta || events[0].Text != "hello from codex" {
		t.Fatalf("first event = %+v, want trimmed text delta", events[0])
	}
	if events[1].Kind != agent.EventKindDone {
		t.Fatalf("last event kind = %q, want %q", events[1].Kind, agent.EventKindDone)
	}
}

func TestProviderRunTurnEmitsErrorEventOnRunnerError(t *testing.T) {
	runnerErr := errors.New("codex failed")
	provider := NewWithRunner(&fakeRunner{err: runnerErr})

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	ch, err := provider.RunTurn(ctx, agent.TurnRequest{})
	if err != nil {
		t.Fatalf("RunTurn returned error: %v", err)
	}
	events := collectEvents(t, ch)

	if got, want := len(events), 1; got != want {
		t.Fatalf("event count = %d, want %d: %+v", got, want, events)
	}
	if events[0].Kind != agent.EventKindError {
		t.Fatalf("event kind = %q, want %q", events[0].Kind, agent.EventKindError)
	}
	if events[0].Err != runnerErr.Error() {
		t.Fatalf("event error = %q, want %q", events[0].Err, runnerErr.Error())
	}
}

type fakeRunner struct {
	stdout string
	err    error
	args   []string
	stdin  string
}

func (r *fakeRunner) Run(_ context.Context, args []string, stdin string) (io.ReadCloser, func() error, error) {
	r.args = append([]string(nil), args...)
	r.stdin = stdin
	if r.err != nil {
		return nil, nil, r.err
	}
	return io.NopCloser(strings.NewReader(r.stdout)), func() error { return nil }, nil
}

func collectEvents(t *testing.T, ch <-chan agent.Event) []agent.Event {
	t.Helper()

	done := make(chan []agent.Event, 1)
	go func() {
		var events []agent.Event
		for event := range ch {
			events = append(events, event)
		}
		done <- events
	}()

	select {
	case events := <-done:
		return events
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for provider event channel to close")
	}
	return nil
}
