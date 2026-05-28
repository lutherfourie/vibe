package claude

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"

	"github.com/lutherfourie/vibe/go/agent"
)

const claudeBinary = "claude"

// Runner starts a Claude CLI turn and returns stdout plus a wait function.
type Runner interface {
	Run(ctx context.Context, args []string, stdin string) (stdout io.ReadCloser, wait func() error, err error)
}

// Provider implements agent.Provider by driving the Claude CLI.
type Provider struct {
	runner Runner

	mu         sync.RWMutex
	sessionID  string
	mcpServers []MCPServerSpec
}

var _ agent.Provider = (*Provider)(nil)

// New returns a Provider backed by the real Claude CLI runner.
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

// WithMCPServers configures MCP servers for Claude CLI tool access.
func (p *Provider) WithMCPServers(servers []MCPServerSpec) *Provider {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.mcpServers = cloneMCPServerSpecs(servers)
	return p
}

// Name returns the provider name.
func (p *Provider) Name() string {
	return "claude"
}

// SessionID returns the latest Claude session_id captured from an init line.
//
// agent.Event has no provider-specific continuation payload, so callers that
// need resume support should read this after the RunTurn event channel closes.
func (p *Provider) SessionID() string {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.sessionID
}

// RunTurn invokes the Claude CLI and streams provider-neutral events.
func (p *Provider) RunTurn(ctx context.Context, req agent.TurnRequest) (<-chan agent.Event, error) {
	runner := p.runner
	if runner == nil {
		runner = realRunner{}
	}

	mcpConfigPath, cleanupMCPConfig, err := p.writeMCPConfig()
	if err != nil {
		return nil, err
	}

	stdout, wait, err := runner.Run(ctx, buildArgs(req, mcpConfigPath), "")
	if err != nil {
		cleanupMCPConfig()
		return nil, err
	}

	out := make(chan agent.Event)
	go p.streamEvents(ctx, stdout, wait, out, cleanupMCPConfig)
	return out, nil
}

func (p *Provider) streamEvents(ctx context.Context, stdout io.ReadCloser, wait func() error, out chan<- agent.Event, cleanup func()) {
	defer close(out)
	if cleanup != nil {
		defer cleanup()
	}
	defer stdout.Close()

	terminal := false
	sessionID, parseErr := parseStream(stdout, func(event agent.Event) bool {
		isTerminal := event.Kind == agent.EventKindDone || event.Kind == agent.EventKindError
		if !sendEvent(ctx, out, event) {
			return false
		}
		if isTerminal {
			terminal = true
		}
		return !terminal
	})
	if sessionID != "" {
		p.setSessionID(sessionID)
	}

	if parseErr != nil && !terminal {
		terminal = sendEvent(ctx, out, agent.ErrorEvent(parseErr.Error()))
	}
	if wait != nil {
		if err := wait(); err != nil && ctx.Err() == nil && !terminal {
			terminal = sendEvent(ctx, out, agent.ErrorEvent(err.Error()))
		}
	}
	if ctx.Err() != nil && !terminal {
		sendCancellationError(out, ctx.Err())
		return
	}
	if !terminal {
		sendEvent(ctx, out, agent.Done())
	}
}

func (p *Provider) setSessionID(sessionID string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.sessionID = sessionID
}

func sendEvent(ctx context.Context, out chan<- agent.Event, event agent.Event) bool {
	select {
	case <-ctx.Done():
		return false
	case out <- event:
		return true
	}
}

func sendCancellationError(out chan<- agent.Event, err error) {
	if err == nil {
		return
	}
	select {
	case out <- agent.ErrorEvent(err.Error()):
	default:
	}
}

func buildArgs(req agent.TurnRequest, mcpConfigPath string) []string {
	args := []string{"-p", buildPrompt(req.Messages), "--output-format", "stream-json", "--verbose"}
	if req.SessionID != "" {
		args = append(args, "--resume", req.SessionID)
	}
	if mcpConfigPath != "" {
		args = append(args, "--mcp-config", mcpConfigPath, "--strict-mcp-config")
	}
	return args
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
	path, err := exec.LookPath(claudeBinary)
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
