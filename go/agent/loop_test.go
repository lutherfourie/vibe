package agent

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/lutherfourie/vibe/go/internal/remote"
)

func TestRunLoopExecutesToolAndRunsSecondTurn(t *testing.T) {
	call := ToolCall{
		ID:   "call-1",
		Name: "lookup",
		Args: json.RawMessage(`{"query":"vibe"}`),
	}
	provider := &scriptedLoopProvider{
		turns: [][]Event{
			{
				TextDelta("checking "),
				ToolCallEvent(call),
				UsageEvent(Usage{InputTokens: 3}),
				Done(),
			},
			{
				TextDelta("done"),
				UsageEvent(Usage{OutputTokens: 5}),
				Done(),
			},
		},
	}
	executor := &recordingToolExecutor{
		result: ToolResult{ID: "call-1", Content: "lookup result"},
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	events, err := RunLoop(ctx, LoopOptions{
		Provider: provider,
		Tools: []ToolSpec{
			{Name: "lookup", Description: "look up a value"},
		},
		Executor: executor,
	}, []Message{{Role: RoleUser, Content: "hello"}})
	if err != nil {
		t.Fatalf("RunLoop returned error: %v", err)
	}

	collected := collectEvents(t, events)

	if got, want := eventKinds(collected), []EventKind{
		EventKindTextDelta,
		EventKindToolCall,
		EventKindUsage,
		EventKindToolResult,
		EventKindTextDelta,
		EventKindUsage,
		EventKindDone,
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("event kinds = %v, want %v", got, want)
	}
	if got, want := assembledText(collected), "checking done"; got != want {
		t.Fatalf("assembled text = %q, want %q", got, want)
	}
	if got, want := collected[3].ToolResult, &executor.result; !reflect.DeepEqual(got, want) {
		t.Fatalf("tool result event = %+v, want %+v", got, want)
	}

	if got, want := executor.callsCopy(), []ToolCall{call}; !reflect.DeepEqual(got, want) {
		t.Fatalf("executor calls = %+v, want %+v", got, want)
	}

	requests := provider.requestsCopy()
	if got, want := len(requests), 2; got != want {
		t.Fatalf("provider turn count = %d, want %d", got, want)
	}
	if got, want := len(requests[0].Tools), 1; got != want {
		t.Fatalf("first turn tools count = %d, want %d", got, want)
	}
	if got, want := len(requests[1].Messages), 3; got != want {
		t.Fatalf("second turn message count = %d, want %d", got, want)
	}
	assertToolCallMessage(t, requests[1].Messages[1], call)
	assertToolResultMessage(t, requests[1].Messages[2], executor.result)
}

func TestRunLoopStopsAtMaxIterations(t *testing.T) {
	call := ToolCall{ID: "call-1", Name: "again"}
	provider := &scriptedLoopProvider{
		turns: [][]Event{
			{ToolCallEvent(call), Done()},
			{ToolCallEvent(call), Done()},
			{ToolCallEvent(call), Done()},
		},
	}
	executor := &recordingToolExecutor{
		result: ToolResult{ID: "call-1", Content: "again result"},
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	events, err := RunLoop(ctx, LoopOptions{
		Provider:      provider,
		Executor:      executor,
		MaxIterations: 2,
	}, []Message{{Role: RoleUser, Content: "start"}})
	if err != nil {
		t.Fatalf("RunLoop returned error: %v", err)
	}
	collected := collectEvents(t, events)

	requests := provider.requestsCopy()
	if got, want := len(requests), 2; got != want {
		t.Fatalf("provider turn count = %d, want %d", got, want)
	}
	if got, want := len(executor.callsCopy()), 1; got != want {
		t.Fatalf("executor call count = %d, want %d", got, want)
	}
	if got := countEvents(collected, EventKindDone); got != 1 {
		t.Fatalf("done event count = %d, want 1", got)
	}
	if got := collected[len(collected)-1].Kind; got != EventKindDone {
		t.Fatalf("last event kind = %q, want %q", got, EventKindDone)
	}
}

func TestRunLoopEmitsTurnTelemetryWhenRemoteControlIsConfigured(t *testing.T) {
	telemetry := make(chan map[string]any, 4)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/rest/v1/provider_quotas":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[]`))
		case r.Method == http.MethodPost && r.URL.Path == "/rest/v1/telemetry_events":
			var event map[string]any
			if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
				t.Errorf("decode telemetry body: %v", err)
			}
			telemetry <- event
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{}]`))
		default:
			t.Errorf("unexpected request %s %s", r.Method, r.URL.String())
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()
	t.Setenv("SUPABASE_URL", server.URL)
	t.Setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

	provider := &scriptedLoopProvider{
		turns: [][]Event{{TextDelta("done"), Done()}},
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	events, err := RunLoop(ctx, LoopOptions{
		Provider: provider,
		Remote:   NewRemoteControl(remote.NewClient(), "session-1"),
	}, []Message{{Role: RoleUser, Content: "hello"}})
	if err != nil {
		t.Fatalf("RunLoop returned error: %v", err)
	}
	_ = collectEvents(t, events)

	kinds := collectTelemetryKinds(t, telemetry, 2)
	if !containsString(kinds, "turn_started") {
		t.Fatalf("telemetry kinds = %v, want turn_started", kinds)
	}
	if !containsString(kinds, "turn_completed") {
		t.Fatalf("telemetry kinds = %v, want turn_completed", kinds)
	}
}

type scriptedLoopProvider struct {
	mu       sync.Mutex
	turns    [][]Event
	requests []TurnRequest
}

func (p *scriptedLoopProvider) Name() string {
	return "scripted-loop"
}

func (p *scriptedLoopProvider) RunTurn(ctx context.Context, req TurnRequest) (<-chan Event, error) {
	p.mu.Lock()
	turn := len(p.requests)
	p.requests = append(p.requests, cloneTurnRequest(req))
	events := []Event{Done()}
	if turn < len(p.turns) {
		events = append([]Event(nil), p.turns[turn]...)
	}
	p.mu.Unlock()

	out := make(chan Event)
	go func() {
		defer close(out)
		for _, event := range events {
			select {
			case <-ctx.Done():
				return
			case out <- event:
			}
		}
	}()
	return out, nil
}

func (p *scriptedLoopProvider) requestsCopy() []TurnRequest {
	p.mu.Lock()
	defer p.mu.Unlock()

	requests := make([]TurnRequest, len(p.requests))
	for i, request := range p.requests {
		requests[i] = cloneTurnRequest(request)
	}
	return requests
}

type recordingToolExecutor struct {
	mu     sync.Mutex
	result ToolResult
	calls  []ToolCall
}

func (e *recordingToolExecutor) ExecuteTool(ctx context.Context, call ToolCall) ToolResult {
	e.mu.Lock()
	defer e.mu.Unlock()

	e.calls = append(e.calls, cloneToolCall(call))
	return e.result
}

func (e *recordingToolExecutor) callsCopy() []ToolCall {
	e.mu.Lock()
	defer e.mu.Unlock()

	calls := make([]ToolCall, len(e.calls))
	for i, call := range e.calls {
		calls[i] = cloneToolCall(call)
	}
	return calls
}

func cloneTurnRequest(req TurnRequest) TurnRequest {
	clone := req
	clone.Messages = append([]Message(nil), req.Messages...)
	clone.Tools = append([]ToolSpec(nil), req.Tools...)
	return clone
}

func cloneToolCall(call ToolCall) ToolCall {
	clone := call
	clone.Args = append(json.RawMessage(nil), call.Args...)
	return clone
}

func eventKinds(events []Event) []EventKind {
	kinds := make([]EventKind, 0, len(events))
	for _, event := range events {
		kinds = append(kinds, event.Kind)
	}
	return kinds
}

func assembledText(events []Event) string {
	var text string
	for _, event := range events {
		if event.Kind == EventKindTextDelta {
			text += event.Text
		}
	}
	return text
}

func countEvents(events []Event, kind EventKind) int {
	var count int
	for _, event := range events {
		if event.Kind == kind {
			count++
		}
	}
	return count
}

func assertToolCallMessage(t *testing.T, message Message, want ToolCall) {
	t.Helper()

	if message.Role != RoleAssistant {
		t.Fatalf("tool call message role = %q, want %q", message.Role, RoleAssistant)
	}
	var event Event
	if err := json.Unmarshal([]byte(message.Content), &event); err != nil {
		t.Fatalf("tool call message content is not JSON event: %v", err)
	}
	if event.Kind != EventKindToolCall {
		t.Fatalf("tool call message kind = %q, want %q", event.Kind, EventKindToolCall)
	}
	if event.ToolCall == nil {
		t.Fatal("tool call message payload is nil")
	}
	if !reflect.DeepEqual(*event.ToolCall, want) {
		t.Fatalf("tool call message payload = %+v, want %+v", *event.ToolCall, want)
	}
}

func assertToolResultMessage(t *testing.T, message Message, want ToolResult) {
	t.Helper()

	if message.Role != RoleTool {
		t.Fatalf("tool result message role = %q, want %q", message.Role, RoleTool)
	}
	var event Event
	if err := json.Unmarshal([]byte(message.Content), &event); err != nil {
		t.Fatalf("tool result message content is not JSON event: %v", err)
	}
	if event.Kind != EventKindToolResult {
		t.Fatalf("tool result message kind = %q, want %q", event.Kind, EventKindToolResult)
	}
	if event.ToolResult == nil {
		t.Fatal("tool result message payload is nil")
	}
	if *event.ToolResult != want {
		t.Fatalf("tool result message payload = %+v, want %+v", *event.ToolResult, want)
	}
}

func collectTelemetryKinds(t *testing.T, ch <-chan map[string]any, want int) []string {
	t.Helper()

	deadline := time.After(time.Second)
	var kinds []string
	for len(kinds) < want {
		select {
		case event := <-ch:
			if kind, ok := event["kind"].(string); ok {
				kinds = append(kinds, kind)
			}
		case <-deadline:
			t.Fatalf("timed out waiting for %d telemetry events; got %v", want, kinds)
		}
	}
	return kinds
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}
