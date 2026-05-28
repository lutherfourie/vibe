package claude

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

func TestProviderRunTurnInvokesRunnerAndStreamsParsedEvents(t *testing.T) {
	runner := &fakeRunner{stdout: fixtureStreamJSON()}
	provider := NewWithRunner(runner)
	req := agent.TurnRequest{
		SessionID: "resume-session",
		Messages: []agent.Message{
			{Role: agent.RoleSystem, Content: "Be concise."},
			{Role: agent.RoleUser, Content: "Read the project README."},
			{Role: agent.RoleAssistant, Content: "I'll check it."},
			{Role: agent.RoleTool, Content: "file contents"},
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	ch, err := provider.RunTurn(ctx, req)
	if err != nil {
		t.Fatalf("RunTurn returned error: %v", err)
	}
	events := collectProviderEvents(t, ch)

	wantPrompt := strings.Join([]string{
		"system:\nBe concise.",
		"user:\nRead the project README.",
		"assistant:\nI'll check it.",
		"tool:\nfile contents",
	}, "\n\n")
	wantArgs := []string{
		"-p", wantPrompt,
		"--output-format", "stream-json",
		"--verbose",
		"--resume", "resume-session",
	}
	if !reflect.DeepEqual(runner.args, wantArgs) {
		t.Fatalf("runner args = %#v, want %#v", runner.args, wantArgs)
	}
	if runner.stdin != "" {
		t.Fatalf("runner stdin = %q, want empty", runner.stdin)
	}

	if got, want := provider.SessionID(), "claude-session-123"; got != want {
		t.Fatalf("SessionID() = %q, want %q", got, want)
	}
	if got, want := len(events), 5; got != want {
		t.Fatalf("event count = %d, want %d: %+v", got, want, events)
	}
	assertEventKind(t, events[0], agent.EventKindTextDelta)
	assertEventKind(t, events[1], agent.EventKindToolCall)
	assertEventKind(t, events[2], agent.EventKindToolResult)
	assertEventKind(t, events[3], agent.EventKindUsage)
	assertEventKind(t, events[4], agent.EventKindDone)
}

func TestProviderRunTurnReturnsRunnerStartError(t *testing.T) {
	runnerErr := errors.New("runner failed")
	provider := NewWithRunner(&fakeRunner{err: runnerErr})

	ch, err := provider.RunTurn(context.Background(), agent.TurnRequest{})
	if !errors.Is(err, runnerErr) {
		t.Fatalf("RunTurn error = %v, want %v", err, runnerErr)
	}
	if ch != nil {
		t.Fatalf("RunTurn channel = %v, want nil", ch)
	}
}

type fakeRunner struct {
	stdout  string
	waitErr error
	err     error
	args    []string
	stdin   string
}

func (r *fakeRunner) Run(_ context.Context, args []string, stdin string) (io.ReadCloser, func() error, error) {
	r.args = append([]string(nil), args...)
	r.stdin = stdin
	if r.err != nil {
		return nil, nil, r.err
	}
	wait := func() error {
		return r.waitErr
	}
	return io.NopCloser(strings.NewReader(r.stdout)), wait, nil
}

func collectProviderEvents(t *testing.T, ch <-chan agent.Event) []agent.Event {
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
