// Package grokcli adapts the locally-authenticated Grok CLI ("Grok Build") to
// the agent.Provider interface so Vibe can spawn it as a subagent.
//
// Unlike the OpenAI-compatible "grok" HTTP provider (which needs GROK_API_KEY /
// XAI_API_KEY), this adapter shells out to the grok CLI and therefore rides on
// the CLI's own OAuth session — no API key required. The grok CLI is itself
// agentic and can delegate to its own subagents (e.g. codex); that capability
// is intentionally left ON (we never pass --no-subagents).
package grokcli

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"

	"github.com/lutherfourie/vibe/go/agent"
)

const grokBinary = "grok"

// defaultMaxTurns bounds how many internal turns the Grok CLI takes for one Vibe
// turn. Overridable via GROK_MAX_TURNS. It matches the proven .autodev editor
// harness value. NOTE: --effort is intentionally never passed — grok-build
// rejects the reasoningEffort parameter with a 400.
const defaultMaxTurns = "120"

// Runner starts a Grok CLI turn and returns stdout plus a wait function. It
// mirrors the Codex adapter's Runner: the working directory is conveyed to the
// CLI via its own --cwd flag (see buildArgs), so no dir argument is needed here.
type Runner interface {
	Run(ctx context.Context, args []string, stdin string) (stdout io.ReadCloser, wait func() error, err error)
}

// isGrokCLIDisabled reports whether grok CLI invocations are blocked via the
// VIBE_DISABLE_GROK_CLI safety valve. Default (env unset) = enabled, since the
// grok CLI is the user's own tool and is explicitly wanted as a spawnable
// subagent. Set VIBE_DISABLE_GROK_CLI=1 to force it off.
func isGrokCLIDisabled() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("VIBE_DISABLE_GROK_CLI")))
	return v == "1" || v == "true" || v == "yes"
}

// Provider implements agent.Provider by driving the Grok CLI.
type Provider struct {
	runner Runner
}

var _ agent.Provider = (*Provider)(nil)

// New returns a Provider backed by the real Grok CLI runner.
func New() *Provider { return NewWithRunner(realRunner{}) }

// NewWithRunner returns a Provider backed by runner. A nil runner uses the real CLI.
func NewWithRunner(runner Runner) *Provider {
	if runner == nil {
		runner = realRunner{}
	}
	return &Provider{runner: runner}
}

// Name returns the provider name.
func (p *Provider) Name() string { return "grok-cli" }

// RunTurn invokes the Grok CLI for a single headless turn
// (`grok -p <prompt> --output-format plain --always-approve ...`).
//
// Grok CLI prints its final answer to stdout (plain mode) rather than a
// structured event stream, so this adapter emits the trimmed stdout as one
// text_delta event then done. The CLI does not expose usage metadata here, so
// no usage event is emitted.
func (p *Provider) RunTurn(ctx context.Context, req agent.TurnRequest) (<-chan agent.Event, error) {
	if isGrokCLIDisabled() {
		return nil, fmt.Errorf("grok CLI provider is DISABLED via VIBE_DISABLE_GROK_CLI; unset it (or set =0) to allow spawning the grok CLI")
	}
	runner := p.runner
	if runner == nil {
		runner = realRunner{}
	}

	out := make(chan agent.Event)
	go func() {
		defer close(out)
		p.run(ctx, runner, req, out)
	}()
	return out, nil
}

func (p *Provider) run(ctx context.Context, runner Runner, req agent.TurnRequest, out chan<- agent.Event) {
	stdout, wait, err := runner.Run(ctx, buildArgs(req), "")
	if err != nil {
		sendTerminalEvent(ctx, out, agent.ErrorEvent(err.Error()))
		return
	}
	if stdout == nil {
		sendTerminalEvent(ctx, out, agent.ErrorEvent("grok-cli runner returned nil stdout"))
		return
	}
	defer stdout.Close()

	data, readErr := io.ReadAll(stdout)
	if wait != nil {
		if err := wait(); err != nil && readErr == nil {
			readErr = err
		}
	}
	if readErr != nil {
		sendTerminalEvent(ctx, out, agent.ErrorEvent(readErr.Error()))
		return
	}
	if err := ctx.Err(); err != nil {
		sendTerminalEvent(ctx, out, agent.ErrorEvent(err.Error()))
		return
	}

	text := strings.TrimSpace(string(data))
	if text != "" {
		if !sendEvent(ctx, out, agent.TextDelta(text)) {
			sendTerminalEvent(ctx, out, agent.ErrorEvent(ctx.Err().Error()))
			return
		}
	}
	if !sendEvent(ctx, out, agent.Done()) {
		sendTerminalEvent(ctx, out, agent.ErrorEvent(ctx.Err().Error()))
	}
}

func sendEvent(ctx context.Context, out chan<- agent.Event, event agent.Event) bool {
	select {
	case <-ctx.Done():
		return false
	case out <- event:
		return true
	}
}

func sendTerminalEvent(ctx context.Context, out chan<- agent.Event, event agent.Event) {
	select {
	case out <- event:
	case <-ctx.Done():
		select {
		case out <- event:
		default:
		}
	}
}

// buildArgs builds the Grok CLI flags for a headless single turn. The prompt is
// passed as the -p value; on Windows grok.exe is a real binary (not a .cmd
// shim), so Go's exec passes args straight to CreateProcess with no cmd.exe
// mangling of multi-line values. The working directory is passed via --cwd.
// Subagents are intentionally left enabled (no --no-subagents), and --effort is
// intentionally omitted (grok-build returns 400 for reasoningEffort).
func buildArgs(req agent.TurnRequest) []string {
	args := []string{"-p", buildPrompt(req.Messages), "--output-format", "plain", "--always-approve"}
	if req.Cwd != "" {
		args = append(args, "--cwd", req.Cwd)
	}
	args = append(args, "--max-turns", maxTurns())
	return args
}

func maxTurns() string {
	if v := strings.TrimSpace(os.Getenv("GROK_MAX_TURNS")); v != "" {
		return v
	}
	return defaultMaxTurns
}

func buildPrompt(messages []agent.Message) string {
	var b strings.Builder
	for _, message := range messages {
		if b.Len() > 0 {
			b.WriteString("\n\n")
		}
		b.WriteString(formatRole(message.Role))
		b.WriteString(":\n")
		b.WriteString(message.Content)
	}
	return b.String()
}

func formatRole(role agent.Role) string {
	if role == "" {
		return string(agent.RoleUser)
	}
	return string(role)
}

type realRunner struct{}

func (realRunner) Run(ctx context.Context, args []string, stdin string) (io.ReadCloser, func() error, error) {
	if isGrokCLIDisabled() {
		return nil, nil, fmt.Errorf("grok CLI is DISABLED (VIBE_DISABLE_GROK_CLI); refusing to LookPath/exec %q", grokBinary)
	}
	path, err := exec.LookPath(grokBinary)
	if err != nil {
		return nil, nil, err
	}

	cmd := exec.CommandContext(ctx, path, args...)
	cmd.Env = os.Environ()
	if stdin != "" {
		cmd.Stdin = strings.NewReader(stdin)
	}

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, nil, err
	}

	wait := func() error {
		err := cmd.Wait()
		if err == nil {
			return nil
		}
		if message := strings.TrimSpace(stderr.String()); message != "" {
			return fmt.Errorf("%w: %s", err, message)
		}
		return err
	}
	return stdout, wait, nil
}
