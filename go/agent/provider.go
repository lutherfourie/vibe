package agent

import "context"

// TurnRequest contains the provider-neutral input for one agent turn.
type TurnRequest struct {
	SessionID string     `json:"sessionId,omitempty"`
	Messages  []Message  `json:"messages"`
	Tools     []ToolSpec `json:"tools,omitempty"`
}

// Provider runs one agent turn and streams provider-neutral events.
//
// RunTurn returns a receive-only channel. For an ordinary turn, the provider
// sends a terminal done or error event before closing the channel. Providers
// must observe ctx cancellation and stop emitting promptly when it is canceled.
type Provider interface {
	Name() string
	RunTurn(ctx context.Context, req TurnRequest) (<-chan Event, error)
}
