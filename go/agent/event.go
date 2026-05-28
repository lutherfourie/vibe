package agent

// EventKind identifies the payload carried by an Event.
type EventKind string

const (
	EventKindTextDelta  EventKind = "text_delta"
	EventKindToolCall   EventKind = "tool_call"
	EventKindToolResult EventKind = "tool_result"
	EventKindUsage      EventKind = "usage"
	EventKindError      EventKind = "error"
	EventKindDone       EventKind = "done"
)

// Event is the provider-neutral stream item rendered by clients.
type Event struct {
	Kind       EventKind   `json:"kind"`
	Text       string      `json:"text,omitempty"`
	ToolCall   *ToolCall   `json:"toolCall,omitempty"`
	ToolResult *ToolResult `json:"toolResult,omitempty"`
	Usage      *Usage      `json:"usage,omitempty"`
	Err        string      `json:"err,omitempty"`
}

// TextDelta constructs a text_delta event.
func TextDelta(text string) Event {
	return Event{Kind: EventKindTextDelta, Text: text}
}

// ToolCallEvent constructs a tool_call event.
func ToolCallEvent(call ToolCall) Event {
	return Event{Kind: EventKindToolCall, ToolCall: &call}
}

// ToolResultEvent constructs a tool_result event.
func ToolResultEvent(result ToolResult) Event {
	return Event{Kind: EventKindToolResult, ToolResult: &result}
}

// UsageEvent constructs a usage event.
func UsageEvent(usage Usage) Event {
	return Event{Kind: EventKindUsage, Usage: &usage}
}

// ErrorEvent constructs an error event.
func ErrorEvent(message string) Event {
	return Event{Kind: EventKindError, Err: message}
}

// Done constructs a done event.
func Done() Event {
	return Event{Kind: EventKindDone}
}
