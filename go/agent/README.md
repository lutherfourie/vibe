# Vibe Go Agent SDK

`github.com/lutherfourie/vibe/go/agent` is Vibe's provider-neutral agent core.
It defines the common shape for one agent turn: callers submit messages and
optional tool metadata, and providers stream uniform events back.

The core package intentionally has no vendor imports. Provider-specific details,
CLI quirks, authentication, permissions, stream formats, and resume mechanics
belong in adapter packages such as `agent/adapters/claude`.

## Core Contract

A provider implements:

```go
type Provider interface {
	Name() string
	RunTurn(ctx context.Context, req TurnRequest) (<-chan Event, error)
}
```

`RunTurn` returns a receive-only event channel for one turn. For an ordinary
turn, providers send a terminal `done` or `error` event before closing the
channel. Providers must observe context cancellation and stop emitting promptly
when the context is canceled. If a provider cannot start the turn, it returns an
error directly.

`TurnRequest` contains:

- `SessionID string`: an adapter-defined continuity token. An empty value means
  a new session to adapters that support sessions.
- `Messages []Message`: the conversation items for the turn.
- `Tools []ToolSpec`: provider-neutral descriptions of available tools. Adapters
  may ignore this until tool wiring is implemented for that provider.

## Events

`Event` is a small tagged union. The `Kind` field decides which payload field is
meaningful:

- `text_delta`: incremental assistant text in `Text`.
- `tool_call`: a provider request to run a tool in `ToolCall`.
- `tool_result`: a tool result in `ToolResult`.
- `usage`: token and cost metadata in `Usage`.
- `error`: terminal provider error text in `Err`.
- `done`: terminal completion marker with no payload.

The package also provides constructors: `TextDelta`, `ToolCallEvent`,
`ToolResultEvent`, `UsageEvent`, `ErrorEvent`, and `Done`.

## Data Types

`Message` is one conversation item:

```go
type Message struct {
	Role    Role
	Content string
}
```

Roles are `system`, `user`, `assistant`, and `tool`.

`ToolSpec` describes a tool available to the provider:

```go
type ToolSpec struct {
	Name        string
	Description string
	Schema      json.RawMessage
}
```

`ToolCall` is a provider request to execute a tool:

```go
type ToolCall struct {
	ID   string
	Name string
	Args json.RawMessage
}
```

`ToolResult` is the result sent back from a tool:

```go
type ToolResult struct {
	ID      string
	Content string
	IsError bool
}
```

`Usage` captures provider-reported metadata:

```go
type Usage struct {
	InputTokens  int
	OutputTokens int
	CostUSD      float64
}
```

## FakeProvider

`FakeProvider` is a deterministic in-memory provider for tests and local
development. If `FakeProvider.Events` is set, `RunTurn` streams those scripted
events. If the script does not include a terminal `done` or `error`, the fake
adds `done` after the script.

If `Events` is empty, the fake finds the last user message, emits it back as
`text_delta` events split into 8-rune chunks, then emits zero `Usage` and
`done`. This keeps tests independent of external CLIs, network access, or model
credentials.

## Adapter Pattern

New adapters should live outside the core package and implement `agent.Provider`.
Keep all vendor-specific behavior inside the adapter:

1. Translate `agent.TurnRequest` into the provider's prompt, API request, or CLI
   invocation.
2. Stream or parse provider output.
3. Map provider events into `agent.Event` values.
4. Send `usage` and a terminal `done`, or send a terminal `error`.
5. Honor context cancellation.

Use `agent/adapters/claude` as the reference. The Claude adapter exposes
`New()` for the real CLI and `NewWithRunner` for tests. It invokes the installed
`claude` binary as:

```text
claude -p <prompt> --output-format stream-json --verbose
```

When `TurnRequest.SessionID` is set, it appends `--resume <session_id>`. It
builds the prompt from role-labelled messages, parses line-delimited JSON from
stdout, maps text/tool/usage/result lines to core events, and stores the latest
Claude session ID on the provider. Because `agent.Event` has no
provider-specific continuation payload, callers that need Claude resume support
read `Provider.SessionID()` after the event channel closes.

## Usage

```go
package main

import (
	"context"
	"fmt"
	"strings"

	"github.com/lutherfourie/vibe/go/agent"
)

func main() {
	provider := agent.FakeProvider{}
	events, err := provider.RunTurn(context.Background(), agent.TurnRequest{
		Messages: []agent.Message{
			{Role: agent.RoleUser, Content: "hello from vibe"},
		},
	})
	if err != nil {
		panic(err)
	}

	var text strings.Builder
	for event := range events {
		if event.Kind == agent.EventKindTextDelta {
			text.WriteString(event.Text)
		}
	}

	fmt.Println(text.String())
}
```
