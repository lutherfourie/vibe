package devpool

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
)

// Gate runs verification logic (build, test, lint, roundtrip) inside a worktree.
// It is the safety contract ported from the .autodev/loop.ps1 model: a change
// only lands if its gate passes.
type Gate interface {
	// Run executes the verify command in dir. passed is true iff the command
	// exited 0. output is the combined stdout+stderr. err is non-nil only for an
	// execution failure that is NOT an ordinary non-zero exit (e.g. the binary
	// could not be started); a non-zero exit yields passed=false, err=nil.
	Run(ctx context.Context, dir string) (passed bool, output string, err error)
}

// CommandGate runs a fixed argv as the verify command. The first element is the
// executable; the rest are its arguments. Empty Argv makes Run a configuration
// error.
type CommandGate struct {
	// Argv is the verify command, e.g. ["go", "build", "./..."] or
	// ["pwsh", "-File", ".autodev/loop.ps1"]. Required.
	Argv []string
	// Env, when non-nil, replaces the child environment. Nil inherits os.Environ.
	Env []string
}

var _ Gate = CommandGate{}

// NewCommandGate constructs a CommandGate from argv.
func NewCommandGate(argv ...string) CommandGate {
	return CommandGate{Argv: argv}
}

// Run executes the configured argv in dir and reports pass/fail by exit code.
func (g CommandGate) Run(ctx context.Context, dir string) (bool, string, error) {
	if len(g.Argv) == 0 {
		return false, "", errors.New("devpool: gate has empty argv")
	}
	cmd := exec.CommandContext(ctx, g.Argv[0], g.Argv[1:]...)
	cmd.Dir = dir
	if g.Env != nil {
		cmd.Env = g.Env
	} else {
		cmd.Env = os.Environ()
	}
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf

	err := cmd.Run()
	output := buf.String()
	if err == nil {
		return true, output, nil
	}
	// A non-zero exit is an expected "gate failed" signal, not an execution error.
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return false, output, nil
	}
	// Anything else (binary not found, context canceled, etc.) is a real error.
	return false, output, err
}

// GateFunc adapts a plain function to the Gate interface (handy for fakes/tests).
type GateFunc func(ctx context.Context, dir string) (bool, string, error)

// Run calls the underlying function.
func (f GateFunc) Run(ctx context.Context, dir string) (bool, string, error) {
	return f(ctx, dir)
}
