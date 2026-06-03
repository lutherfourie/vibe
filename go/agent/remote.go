package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/lutherfourie/vibe/go/internal/remote"
)

// RemoteControl integrates Supabase remote commands into an agent run.
// The autonomous runner (or any long-running Go agent) can use this to
// listen for commands from Grok/Claude/etc and react (pause, inject instruction, etc.).
// Usage in a runner loop:
//
//   rc := remote.NewClient()
//   ctrl := agent.NewRemoteControl(rc, sessionID)
//   go ctrl.StartPoller(ctx, 3*time.Second, func(cmd remote.AgentCommand) {
//       // handle e.g. if cmd.Command == "instruct" { inject into conversation }
//       // then ctrl.Ack(cmd.ID, "ok", result)
//   })
//
// This satisfies "Go code so the autonomous runner listens for and processes remote commands".

type RemoteControl struct {
	client    *remote.Client
	sessionID string
}

func NewRemoteControl(client *remote.Client, sessionID string) *RemoteControl {
	if client == nil {
		client = remote.NewClient()
	}
	return &RemoteControl{client: client, sessionID: sessionID}
}

// StartPoller starts a background poller that calls handler for each pending command.
// Handler should be quick; use Ack to respond.
func (r *RemoteControl) StartPoller(ctx context.Context, interval time.Duration, handler func(remote.AgentCommand)) {
	go func() {
		_ = r.client.PollForCommands(ctx, r.sessionID, interval, func(cmd remote.AgentCommand) error {
			handler(cmd)
			return nil // handler does Ack
		})
	}()
}

// Ack marks a command completed and writes a response + event.
func (r *RemoteControl) Ack(ctx context.Context, cmdID, status string, result any, message string) error {
	if err := r.client.UpdateCommandStatus(ctx, cmdID, status); err != nil {
		return err
	}
	resB, _ := json.Marshal(result)
	resp := remote.AgentResponse{
		CommandID: cmdID,
		SessionID: r.sessionID,
		Status:    status,
		Result:    resB,
		Message:   message,
	}
	if err := r.client.CreateResponse(ctx, resp); err != nil {
		return err
	}
	evt := remote.AgentEvent{
		SessionID: r.sessionID,
		CommandID: cmdID,
		Kind:      "command_processed",
		Payload:   resB,
	}
	return r.client.CreateEvent(ctx, evt)
}

// EmitEvent is a helper an external can use, but from runner side it's for emitting.
func (r *RemoteControl) EmitEvent(ctx context.Context, kind string, payload any) error {
	b, _ := json.Marshal(payload)
	return r.client.CreateEvent(ctx, remote.AgentEvent{
		SessionID: r.sessionID,
		Kind:      kind,
		Payload:   b,
	})
}

// EmitTelemetry is a thin wrapper so autonomous code (loop, resource dispatcher, providers)
// can emit usage telemetry without caring about the underlying client. Telemetry is best-effort
// and opt-in (controlled at the call sites via VIBE_TELEMETRY or plan config).
// Hosted on the same Supabase as everything else for simplicity and dogfooding.
func (r *RemoteControl) EmitTelemetry(ctx context.Context, kind, source string, payload any) error {
	if r == nil || r.client == nil {
		return nil
	}
	b, _ := json.Marshal(payload)
	return r.client.EmitTelemetry(ctx, remote.TelemetryEvent{
		SessionID: r.sessionID,
		Kind:      kind,
		Source:    source,
		Payload:   b,
	})
}

// Example: integrate pause/resume into a loop by checking commands before turns.
// In practice, the Vibe autonomous "runner" (AI + this Go) can use Poll + Ack
// to implement pause by blocking until 'resume' command arrives.
func (r *RemoteControl) WaitForResume(ctx context.Context, cmd remote.AgentCommand) error {
	// simplistic: ack the pause, then block polling for resume
	if cmd.Command != "pause" {
		return nil
	}
	_ = r.Ack(ctx, cmd.ID, "completed", map[string]any{"action": "paused"}, "paused by remote command")
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			cmds, _ := r.client.ListPendingCommands(ctx, r.sessionID)
			for _, c := range cmds {
				if c.Command == "resume" {
					_ = r.Ack(ctx, c.ID, "completed", map[string]any{"action": "resumed"}, "")
					return nil
				}
			}
			time.Sleep(2 * time.Second)
		}
	}
}

// ProcessCommand is a basic handler for common remote commands.
// A real autonomous runner would call this from the PollForCommands handler.
// It performs the action (or simulates for Vibe primitives) and always Acks.
func (r *RemoteControl) ProcessCommand(ctx context.Context, cmd remote.AgentCommand) error {
	result := map[string]any{
		"command": cmd.Command,
		"action":  "processed",
		"note":    "handled by RemoteControl.ProcessCommand (demo)",
	}
	msg := ""

	switch cmd.Command {
	case "instruct", "instruction":
		// Simulate injecting the instruction into the agent's context / PROGRESS.
		// In full impl, this could write to a session memory or trigger a step.
		var p map[string]any
		json.Unmarshal(cmd.Payload, &p)
		if instr, ok := p["instruction"]; ok {
			result["injected"] = instr
			msg = fmt.Sprintf("instruction received and injected: %v", instr)
		}
		_ = r.EmitEvent(ctx, "instruction_received", result)
	case "pause":
		return r.WaitForResume(ctx, cmd) // blocks until resume
	case "resume":
		// Usually sent to unblock; here just ack
		msg = "resume acknowledged (if waiting, would unblock)"
	case "status":
		result["current_status"] = "running (simulated)"
		_ = r.EmitEvent(ctx, "status_reported", result)
	case "checkpoint":
		result["checkpoint"] = "would call vibe checkpoint or internal progress"
		_ = r.EmitEvent(ctx, "checkpoint_requested", result)
	case "sync-supabase":
		result["action"] = "sync-supabase"
		if out, err := runPnpmInfra("infra:sync-supabase"); err != nil {
			result["output"] = out
			result["error"] = err.Error()
			msg = "sync-supabase auto-exec completed with error"
		} else {
			result["output"] = out
			msg = "sync-supabase auto-executed successfully (migrations pushed to hosted)"
		}
		_ = r.EmitEvent(ctx, "infra_sync_requested", result)
	case "deploy-vercel":
		result["action"] = "deploy-vercel"
		if out, err := runPnpmInfra("infra:deploy-vercel"); err != nil {
			result["output"] = out
			result["error"] = err.Error()
			msg = "deploy-vercel auto-exec completed with error"
		} else {
			result["output"] = out
			msg = "deploy-vercel auto-executed successfully (prod deploy triggered)"
		}
		_ = r.EmitEvent(ctx, "infra_deploy_requested", result)
	case "sync-infra":
		result["action"] = "sync-infra"
		var allOut strings.Builder
		// Run supabase first (schema), then vercel (code+UI+APIs) so remote control plane is current.
		if out1, err1 := runPnpmInfra("infra:sync-supabase"); err1 != nil {
			allOut.WriteString("supabase: " + out1 + "\nERROR: " + err1.Error() + "\n")
		} else {
			allOut.WriteString("supabase: " + out1 + "\n")
		}
		if out2, err2 := runPnpmInfra("infra:deploy-vercel"); err2 != nil {
			allOut.WriteString("vercel: " + out2 + "\nERROR: " + err2.Error())
		} else {
			allOut.WriteString("vercel: " + out2)
		}
		result["output"] = strings.TrimSpace(allOut.String())
		msg = "sync-infra auto-executed both (see output for details)"
		_ = r.EmitEvent(ctx, "infra_sync_requested", result)
	default:
		msg = "unknown command, acked as no-op"
	}

	// Telemetry for remote command processing (best effort). This is one of the core
	// places we want metrics: how often remote control is used, which commands, success.
	_ = r.EmitTelemetry(ctx, "remote_command_processed", "go", map[string]any{
		"command":   cmd.Command,
		"issued_by": cmd.IssuedBy,
	})

	return r.Ack(ctx, cmd.ID, "completed", result, msg)
}

// runPnpmInfra executes one of the root pnpm infra:* scripts (sync-supabase, deploy-vercel).
// Captures combined stdout/stderr so remote ack + events contain the full CLI output.
// This is what makes "remote control" able to automatically keep Supabase and Vercel
// in sync when a command is queued (e.g. from Grok chat or dashboard button) and a
// poller/runner for the session is active with CLIs + auth in its env.
func runPnpmInfra(subcmd string) (string, error) {
	cmd := exec.Command("pnpm", "run", subcmd)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	return strings.TrimSpace(out.String()), err
}
