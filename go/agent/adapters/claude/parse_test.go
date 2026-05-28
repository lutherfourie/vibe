package claude

import (
	"strings"
	"testing"

	"github.com/lutherfourie/vibe/go/agent"
)

func TestParseStreamMapsEventsAndCapturesSessionID(t *testing.T) {
	events, sessionID, err := ParseStream(strings.NewReader(fixtureStreamJSON()))
	if err != nil {
		t.Fatalf("ParseStream returned error: %v", err)
	}

	if got, want := sessionID, "claude-session-123"; got != want {
		t.Fatalf("sessionID = %q, want %q", got, want)
	}
	if got, want := len(events), 5; got != want {
		t.Fatalf("event count = %d, want %d: %+v", got, want, events)
	}

	assertEventKind(t, events[0], agent.EventKindTextDelta)
	if got, want := events[0].Text, "Hello from Claude."; got != want {
		t.Fatalf("text delta = %q, want %q", got, want)
	}

	assertEventKind(t, events[1], agent.EventKindToolCall)
	if events[1].ToolCall == nil {
		t.Fatal("tool call payload is nil")
	}
	if got, want := events[1].ToolCall.ID, "toolu_1"; got != want {
		t.Fatalf("tool call id = %q, want %q", got, want)
	}
	if got, want := events[1].ToolCall.Name, "Read"; got != want {
		t.Fatalf("tool call name = %q, want %q", got, want)
	}
	if got, want := string(events[1].ToolCall.Args), `{"path":"README.md"}`; got != want {
		t.Fatalf("tool call args = %s, want %s", got, want)
	}

	assertEventKind(t, events[2], agent.EventKindToolResult)
	if events[2].ToolResult == nil {
		t.Fatal("tool result payload is nil")
	}
	if got, want := events[2].ToolResult.ID, "toolu_1"; got != want {
		t.Fatalf("tool result id = %q, want %q", got, want)
	}
	if got, want := events[2].ToolResult.Content, "file contents"; got != want {
		t.Fatalf("tool result content = %q, want %q", got, want)
	}
	if events[2].ToolResult.IsError {
		t.Fatal("tool result IsError = true, want false")
	}

	assertEventKind(t, events[3], agent.EventKindUsage)
	if events[3].Usage == nil {
		t.Fatal("usage payload is nil")
	}
	if got, want := events[3].Usage.InputTokens, 12; got != want {
		t.Fatalf("input tokens = %d, want %d", got, want)
	}
	if got, want := events[3].Usage.OutputTokens, 7; got != want {
		t.Fatalf("output tokens = %d, want %d", got, want)
	}
	if got, want := events[3].Usage.CostUSD, 0.0042; got != want {
		t.Fatalf("cost = %f, want %f", got, want)
	}

	assertEventKind(t, events[4], agent.EventKindDone)
}

func fixtureStreamJSON() string {
	return strings.Join([]string{
		`{"type":"system","subtype":"init","session_id":"claude-session-123"}`,
		`{malformed-json`,
		`{"type":"stream_event","delta":{"type":"text_delta","text":"Hello from Claude."}}`,
		`{"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"tool_use","id":"toolu_1","name":"Read","input":{"path":"README.md"}}}}`,
		`{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"tool_result","tool_use_id":"toolu_1","content":[{"type":"text","text":"file contents"}],"is_error":false}}}`,
		`{"type":"result","subtype":"success","total_cost_usd":0.0042,"usage":{"input_tokens":12,"output_tokens":7}}`,
	}, "\n")
}

func assertEventKind(t *testing.T, event agent.Event, want agent.EventKind) {
	t.Helper()
	if event.Kind != want {
		t.Fatalf("event kind = %q, want %q: %+v", event.Kind, want, event)
	}
}
