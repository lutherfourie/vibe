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

	// Fanout, when it lists 2+ providers, makes every loop turn run the SAME
	// request across ALL of them concurrently (agent.SpawnParallel); the
	// strongest result (PickBest) drives the loop and its events are replayed
	// into the stream. With 0 or 1 entries the loop uses Provider as before.
	//
	// This is the M2 multi-provider payoff. For example,
	//   LoopOptions{Fanout: []Provider{cerebras, grokCLI}}
	// fans Cerebras GLM and the Grok CLI side-by-side each turn and keeps the
	// better one. When Fanout is set, Provider may be nil (Fanout[0] is used
	// for any single-provider turns). Callers wanting different selection
	// semantics (judge panel, schema-merge, first-to-finish) can run
	// SpawnParallel directly instead of using the loop.
	Fanout []Provider

	// Remote (optional) enables Supabase C&C for autonomous agents.
	// The runner can receive pause/resume/instruct from Grok/Claude/etc.
	// See agent/remote.go and internal/remote/client.go .
	Remote *RemoteControl

	// VibeDecls + StepExecutor support modern declarations (Tool/Eval/...) inside
	// lane plans for autonomous workflows. When provided, RunLoop can drive
	// declared steps (e.g. Pawfall asset review: generate + expert_review eval).
	// Fully backward: nil means legacy tool-only behavior via Executor.
	VibeDecls    *VibeDeclarations
	StepExecutor StepExecutor
}

// RunLoop runs provider turns until no tool calls remain or MaxIterations is hit.
func RunLoop(ctx context.Context, opts LoopOptions, messages []Message) (<-chan Event, error) {
	primary := opts.Provider
	if primary == nil && len(opts.Fanout) > 0 {
		// Fan-out-only configuration: use the first listed provider for any
		// single-provider turns (the fan-out path itself ignores this).
		primary = opts.Fanout[0]
	}
	if primary == nil {
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
	fanout := append([]Provider(nil), opts.Fanout...)

	// Wire modern vibe decls into loop (registration stub for declared Tools).
	if opts.VibeDecls != nil && opts.StepExecutor != nil {
		if defExec, ok := opts.StepExecutor.(*DefaultStepExecutor); ok { // best-effort bridge
			for _, t := range opts.VibeDecls.Tools {
				defExec.RegisterVibeTool(t)
			}
		}
		// In full impl, also surface Tools from VibeDecls into provider Tools list.
	}

	go func() {
		defer close(out)
		runLoop(ctx, out, primary, fanout, tools, opts.Executor, maxIterations, conversation, opts.VibeDecls, opts.StepExecutor, opts.Remote)
	}()

	return out, nil
}

func runLoop(
	ctx context.Context,
	out chan<- Event,
	provider Provider,
	fanout []Provider,
	tools []ToolSpec,
	executor ToolExecutor,
	maxIterations int,
	conversation []Message,
	vibeDecls *VibeDeclarations,
	stepExec StepExecutor,
	remote *RemoteControl,
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
		if remote != nil {
			_ = remote.EmitEvent(ctx, "loop_iteration", map[string]any{"iteration": iteration})
			_ = remote.EmitTelemetry(ctx, "turn_started", "loop", map[string]any{"iteration": iteration})
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

		turnEvents, err := chooseTurn(ctx, provider, fanout, TurnRequest{
			Messages: append([]Message(nil), conversation...),
			Tools:    append([]ToolSpec(nil), tools...),
		})
		if err != nil {
			sendLoopError(ctx, out, err)
			return
		}

		toolCalls, stopped := forwardTurnEvents(ctx, out, turnEvents)
		if remote != nil {
			_ = remote.EmitTelemetry(ctx, "turn_completed", "loop", map[string]any{"iteration": iteration, "tool_calls": len(toolCalls)})
		}
		if stopped {
			return
		}
		if len(toolCalls) == 0 || executor == nil || iteration == maxIterations-1 {
			// Modern step executor hook (Temporal-style): if VibeDecls + executor present,
			// the autonomous driver can feed steps here. For demo we execute a no-op
			// checkpoint-style step when decls provided (Pawfall pattern).
			if vibeDecls != nil && stepExec != nil && len(vibeDecls.Tools)+len(vibeDecls.Evals) > 0 {
				_, _ = stepExec.ExecuteVibeStep(ctx, VibeStep{Type: "checkpoint", Checkpoint: "post-turn"}, vibeDecls)
			}
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

// chooseTurn runs one provider turn. When fanout lists 2+ providers it fans the
// SAME request across all of them concurrently (SpawnParallel) and replays the
// strongest result (PickBest) into the loop; otherwise it streams the single
// primary provider live. A fan-out winner that errored still surfaces its error
// event, so the loop's existing error handling applies uniformly.
func chooseTurn(ctx context.Context, primary Provider, fanout []Provider, req TurnRequest) (<-chan Event, error) {
	if len(fanout) >= 2 {
		best, ok := PickBest(SpawnParallel(ctx, fanout, req))
		if !ok {
			return nil, errors.New("agent: multi-provider fan-out produced no results")
		}
		return replayEvents(best.Events), nil
	}
	return primary.RunTurn(ctx, req)
}

// replayEvents returns a closed, buffered channel yielding the already-collected
// events in order. It feeds a fan-out winner's events back through the loop's
// normal streaming machinery without holding a live provider connection open.
func replayEvents(events []Event) <-chan Event {
	ch := make(chan Event, len(events))
	for _, ev := range events {
		ch <- ev
	}
	close(ch)
	return ch
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
