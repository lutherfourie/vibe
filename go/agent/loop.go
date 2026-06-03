package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/lutherfourie/vibe/go/internal/resource"
)

const defaultMaxLoopIterations = 8

// ToolExecutor satisfies tool calls collected during a provider turn.
type ToolExecutor interface {
	ExecuteTool(ctx context.Context, call ToolCall) ToolResult
}

// LoopOptions configures RunLoop.
//
// If Executor is nil, tool calls cannot be satisfied. In that mode RunLoop
// streams the first provider turn and stops without attempting another turn.
type LoopOptions struct {
	Provider      Provider
	Tools         []ToolSpec
	Executor      ToolExecutor
	MaxIterations int

	// Remote (optional) enables Supabase C&C for autonomous agents.
	// The runner can receive pause/resume/instruct from Grok/Claude/etc.
	// See agent/remote.go and internal/remote/client.go .
	Remote *RemoteControl
}

// RunLoop runs provider turns until no tool calls remain or MaxIterations is hit.
func RunLoop(ctx context.Context, opts LoopOptions, messages []Message) (<-chan Event, error) {
	if opts.Provider == nil {
		return nil, errors.New("agent: loop provider is nil")
	}
	if ctx == nil {
		ctx = context.Background()
	}

	maxIterations := opts.MaxIterations
	if maxIterations <= 0 {
		maxIterations = defaultMaxLoopIterations
	}

	out := make(chan Event)
	conversation := append([]Message(nil), messages...)
	tools := append([]ToolSpec(nil), opts.Tools...)

	go func() {
		defer close(out)
		runLoop(ctx, out, opts.Provider, tools, opts.Executor, maxIterations, conversation)
	}()

	return out, nil
}

func runLoop(
	ctx context.Context,
	out chan<- Event,
	provider Provider,
	tools []ToolSpec,
	executor ToolExecutor,
	maxIterations int,
	conversation []Message,
) {
	for iteration := 0; iteration < maxIterations; iteration++ {
		if err := ctx.Err(); err != nil {
			sendLoopError(ctx, out, err)
			return
		}

		// Remote C&C hook: if provided, the autonomous runner can react to
		// Supabase commands (pause, instruct, resume, etc.) in real-time.
		// The Go runner (or long-lived agent) polls agent_commands for the session.
		// External (Grok etc) POST to web /api/agent/command to queue them.
		// See agent/remote.go + internal/remote/client.go for PollForCommands + Ack.
		// (Example hook; production uses bg poller from RemoteControl.StartPoller.)
		if r := getRemoteFromContext(ctx); r != nil && r.Remote != nil {
			_ = r.Remote.EmitEvent(ctx, "loop_iteration", map[string]any{"iteration": iteration})
			_ = r.Remote.EmitTelemetry(ctx, "turn_start", "loop", map[string]any{"iteration": iteration})
		}

		// Resource-aware: before provider turn (which may delegate externally), consult
		// dispatcher and log recommended provider. This ensures CLI delegations are
		// quota/cost conscious per the resource-economy lane.
		if len(conversation) > 0 {
			est := resource.EstimateTaskCost("", "autonomous-turn")
			disp := resource.NewResourceAwareDispatcher()
			if rec, err := disp.Recommend(ctx, est); err == nil && rec.Provider != "" && rec.Provider != "none" {
				resource.LogDecision(rec, fmt.Sprintf("loop-iteration-%d", iteration))
			}
		}

		turnEvents, err := provider.RunTurn(ctx, TurnRequest{
			Messages: append([]Message(nil), conversation...),
			Tools:    append([]ToolSpec(nil), tools...),
		})
		if err != nil {
			sendLoopError(ctx, out, err)
			return
		}

		toolCalls, stopped := forwardTurnEvents(ctx, out, turnEvents)
		if r := getRemoteFromContext(ctx); r != nil && r.Remote != nil {
			_ = r.Remote.EmitTelemetry(ctx, "turn_end", "loop", map[string]any{"iteration": iteration, "tool_calls": len(toolCalls)})
		}
		if stopped {
			return
		}
		if len(toolCalls) == 0 || executor == nil || iteration == maxIterations-1 {
			sendLoopEvent(ctx, out, Done())
			return
		}

		for _, call := range toolCalls {
			if err := ctx.Err(); err != nil {
				sendLoopError(ctx, out, err)
				return
			}

			result := executor.ExecuteTool(ctx, call)
			if !sendLoopEvent(ctx, out, ToolResultEvent(result)) {
				return
			}

			nextConversation, err := appendToolExchange(conversation, call, result)
			if err != nil {
				sendLoopError(ctx, out, err)
				return
			}
			conversation = nextConversation
		}
	}

	sendLoopEvent(ctx, out, Done())
}

// getRemoteFromContext is a tiny helper so LoopOptions.Remote can influence the run
// without changing the RunLoop signature heavily. In production use the bg poller
// from remote.go instead of ctx hack.
func getRemoteFromContext(ctx context.Context) *LoopOptions {
	// For demo: real impl would pass options down or use closure.
	// Here we return nil; the integration example lives in agent/remote.go.
	return nil
}

func forwardTurnEvents(ctx context.Context, out chan<- Event, turnEvents <-chan Event) ([]ToolCall, bool) {
	var toolCalls []ToolCall
	for event := range turnEvents {
		switch event.Kind {
		case EventKindDone:
			continue
		case EventKindError:
			sendLoopEvent(ctx, out, event)
			return nil, true
		case EventKindToolCall:
			if event.ToolCall != nil {
				toolCalls = append(toolCalls, *event.ToolCall)
			}
		}

		if !sendLoopEvent(ctx, out, event) {
			return nil, true
		}
	}
	return toolCalls, false
}

func appendToolExchange(conversation []Message, call ToolCall, result ToolResult) ([]Message, error) {
	callContent, err := marshalLoopEvent(ToolCallEvent(call))
	if err != nil {
		return nil, err
	}
	resultContent, err := marshalLoopEvent(ToolResultEvent(result))
	if err != nil {
		return nil, err
	}

	next := make([]Message, 0, len(conversation)+2)
	next = append(next, conversation...)
	next = append(next,
		Message{Role: RoleAssistant, Content: callContent},
		Message{Role: RoleTool, Content: resultContent},
	)
	return next, nil
}

func marshalLoopEvent(event Event) (string, error) {
	content, err := json.Marshal(event)
	if err != nil {
		return "", err
	}
	return string(content), nil
}

func sendLoopEvent(ctx context.Context, out chan<- Event, event Event) bool {
	select {
	case <-ctx.Done():
		return false
	case out <- event:
		return true
	}
}

func sendLoopError(ctx context.Context, out chan<- Event, err error) {
	if err == nil {
		return
	}
	if ctx.Err() != nil {
		select {
		case out <- ErrorEvent(err.Error()):
		default:
		}
		return
	}
	sendLoopEvent(ctx, out, ErrorEvent(err.Error()))
}
