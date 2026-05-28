package codex

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

const codexBinary = "codex"

// Runner starts a Codex CLI turn and returns stdout plus a wait function.
type Runner interface {
	Run(ctx context.Context, args []string, stdin string) (stdout io.ReadCloser, wait func() error, err error)
}

// Provider implements agent.Provider by driving the Codex CLI.
type Provider struct {
	runner Runner
}

var _ agent.Provider = (*Provider)(nil)

// New returns a Provider backed by the real Codex CLI runner.
func New() *Provider {
	return NewWithRunner(realRunner{})
}

// NewWithRunner returns a Provider backed by runner. A nil runner uses the real CLI.
func NewWithRunner(runner Runner) *Provider {
	if runner == nil {
		runner = realRunner{}
	}
	return &Provider{runner: runner}
}

// Name returns the provider name.
func (p *Provider) Name() string {
	return "codex"
}

// RunTurn invokes `codex exec` for a single non-streaming turn.
//
// Codex CLI v1 prints the final answer to stdout rather than a structured event
// stream. This adapter therefore emits the trimmed stdout as one text_delta
// event, then done. The CLI does not expose usage metadata here, so no usage
// event is emitted.
func (p *Provider) RunTurn(ctx context.Context, req agent.TurnRequest) (<-chan agent.Event, error) {
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
		sendTerminalEvent(ctx, out, agent.ErrorEvent("codex runner returned nil stdout"))
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

func buildArgs(req agent.TurnRequest) []string {
	return []string{"exec", "--sandbox", "read-only", "--skip-git-repo-check", buildPrompt(req.Messages)}
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
	path, err := exec.LookPath(codexBinary)
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
