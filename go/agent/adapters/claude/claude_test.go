package claude

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
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
	assertArgAbsent(t, runner.args, "--mcp-config")
	assertArgAbsent(t, runner.args, "--strict-mcp-config")
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

func TestProviderRunTurnWritesMCPConfigAndPassesArgs(t *testing.T) {
	var configPath string
	var configJSON []byte
	runner := &fakeRunner{
		stdout: fixtureStreamJSON(),
		onRun: func(args []string) {
			idx := argIndex(args, "--mcp-config")
			if idx < 0 {
				t.Fatal("runner args missing --mcp-config")
			}
			if idx+1 >= len(args) {
				t.Fatal("runner args missing value after --mcp-config")
			}
			configPath = args[idx+1]

			data, err := os.ReadFile(configPath)
			if err != nil {
				t.Fatalf("reading mcp config: %v", err)
			}
			configJSON = data
		},
	}
	provider := NewWithRunner(runner).WithMCPServers([]MCPServerSpec{
		{
			Name:    "filesystem",
			Command: "node",
			Args:    []string{"server.js", "--root", `C:\tmp`},
			Env:     []string{"DEBUG=1", "TOKEN=a=b", "EMPTY="},
		},
	})

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	ch, err := provider.RunTurn(ctx, agent.TurnRequest{
		Messages: []agent.Message{{Role: agent.RoleUser, Content: "Use a tool."}},
	})
	if err != nil {
		t.Fatalf("RunTurn returned error: %v", err)
	}
	collectProviderEvents(t, ch)

	configArgIndex := argIndex(runner.args, "--mcp-config")
	if configArgIndex < 0 {
		t.Fatalf("runner args = %#v, want --mcp-config", runner.args)
	}
	if got, want := runner.args[configArgIndex+1], configPath; got != want {
		t.Fatalf("mcp config arg = %q, want %q", got, want)
	}
	if strictIndex := argIndex(runner.args, "--strict-mcp-config"); strictIndex < 0 {
		t.Fatalf("runner args = %#v, want --strict-mcp-config", runner.args)
	}

	var got struct {
		MCPServers map[string]struct {
			Command string            `json:"command"`
			Args    []string          `json:"args"`
			Env     map[string]string `json:"env"`
		} `json:"mcpServers"`
	}
	if err := json.Unmarshal(configJSON, &got); err != nil {
		t.Fatalf("unmarshal mcp config: %v\n%s", err, configJSON)
	}
	server, ok := got.MCPServers["filesystem"]
	if !ok {
		t.Fatalf("mcpServers missing filesystem: %#v", got.MCPServers)
	}
	if got, want := server.Command, "node"; got != want {
		t.Fatalf("command = %q, want %q", got, want)
	}
	if want := []string{"server.js", "--root", `C:\tmp`}; !reflect.DeepEqual(server.Args, want) {
		t.Fatalf("args = %#v, want %#v", server.Args, want)
	}
	wantEnv := map[string]string{"DEBUG": "1", "TOKEN": "a=b", "EMPTY": ""}
	if !reflect.DeepEqual(server.Env, wantEnv) {
		t.Fatalf("env = %#v, want %#v", server.Env, wantEnv)
	}
	if _, err := os.Stat(configPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("mcp config file still exists or unexpected stat error: %v", err)
	}
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
	onRun   func(args []string)
}

func (r *fakeRunner) Run(_ context.Context, args []string, stdin string) (io.ReadCloser, func() error, error) {
	r.args = append([]string(nil), args...)
	r.stdin = stdin
	if r.onRun != nil {
		r.onRun(args)
	}
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

func argIndex(args []string, want string) int {
	for i, arg := range args {
		if arg == want {
			return i
		}
	}
	return -1
}

func assertArgAbsent(t *testing.T, args []string, want string) {
	t.Helper()
	if idx := argIndex(args, want); idx >= 0 {
		t.Fatalf("runner args = %#v, did not expect %s", args, want)
	}
}
