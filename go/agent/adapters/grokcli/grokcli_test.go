package grokcli

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
	t.Setenv("VIBE_DISABLE_GROK_CLI", "")
	t.Setenv("GROK_MAX_TURNS", "7")

	runner := &fakeRunner{stdout: "\nhello from grok\n\n"}
	provider := NewWithRunner(runner)
	req := agent.TurnRequest{
		Messages: []agent.Message{
			{Role: agent.RoleSystem, Content: "Be concise."},
			{Role: agent.RoleUser, Content: "Summarize the repo."},
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	ch, err := provider.RunTurn(ctx, req)
	if err != nil {
		t.Fatalf("RunTurn returned error: %v", err)
	}
	events := collectEvents(t, ch)

	if got, want := provider.Name(), "grok-cli"; got != want {
		t.Fatalf("Name() = %q, want %q", got, want)
	}
	wantPrompt := "system:\nBe concise.\n\nuser:\nSummarize the repo."
	wantArgs := []string{"-p", wantPrompt, "--output-format", "plain", "--always-approve", "--max-turns", "7"}
	if !reflect.DeepEqual(runner.args, wantArgs) {
		t.Fatalf("runner args = %#v, want %#v", runner.args, wantArgs)
	}
	if runner.stdin != "" {
		t.Fatalf("runner stdin = %q, want empty", runner.stdin)
	}
	if got, want := len(events), 2; got != want {
		t.Fatalf("event count = %d, want %d: %+v", got, want, events)
	}
	if events[0].Kind != agent.EventKindTextDelta || events[0].Text != "hello from grok" {
		t.Fatalf("first event = %+v, want trimmed text delta", events[0])
	}
	if events[1].Kind != agent.EventKindDone {
		t.Fatalf("last event kind = %q, want %q", events[1].Kind, agent.EventKindDone)
	}
}

func TestBuildArgsIncludesCwdWhenSet(t *testing.T) {
	t.Setenv("GROK_MAX_TURNS", "120")
	req := agent.TurnRequest{
		Cwd:      "/work/editor",
		Messages: []agent.Message{{Role: agent.RoleUser, Content: "go"}},
	}
	got := buildArgs(req)
	want := []string{"-p", "user:\ngo", "--output-format", "plain", "--always-approve", "--cwd", "/work/editor", "--max-turns", "120"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("buildArgs = %#v, want %#v", got, want)
	}
}

func TestProviderRunTurnEmitsErrorEventOnRunnerError(t *testing.T) {
	t.Setenv("VIBE_DISABLE_GROK_CLI", "")
	runnerErr := errors.New("grok failed")
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

func TestRunTurnRefusesWhenDisabled(t *testing.T) {
	t.Setenv("VIBE_DISABLE_GROK_CLI", "1")
	runner := &fakeRunner{stdout: "should not run"}
	provider := NewWithRunner(runner)

	_, err := provider.RunTurn(context.Background(), agent.TurnRequest{
		Messages: []agent.Message{{Role: agent.RoleUser, Content: "hi"}},
	})
	if err == nil {
		t.Fatal("RunTurn should error when VIBE_DISABLE_GROK_CLI is set")
	}
	if runner.args != nil {
		t.Fatalf("disabled provider must not invoke the runner; got args %#v", runner.args)
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
