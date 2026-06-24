package crewai

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"sync"
)

// Runner abstracts python (or equivalent) subprocess execution so the real
// interpreter is only used when explicitly configured. This mirrors the
// Runner pattern from go/agent/adapters/codex and the exec/error handling from
// go/internal/devpool/gate.go exactly.
type Runner interface {
	// Execute runs argv[0] argv[1:] inside dir. Env entries (if non-nil) are
	// merged over os.Environ(). Returns:
	//   passed: true only for clean exit 0
	//   output: combined stdout+stderr (always captured)
	//   err: non-nil only for spawn/wait errors other than non-zero exit
	Execute(ctx context.Context, dir string, argv []string, env []string) (passed bool, output string, err error)
}

// CommandRunner is the production runner. Uses os/exec.CommandContext with
// combined output buffer and *exec.ExitError handling identical to devpool/gate.
type CommandRunner struct{}

var _ Runner = CommandRunner{}

func (CommandRunner) Execute(ctx context.Context, dir string, argv []string, env []string) (bool, string, error) {
	if len(argv) == 0 {
		return false, "", errors.New("crewai: runner argv is empty")
	}
	cmd := exec.CommandContext(ctx, argv[0], argv[1:]...)
	cmd.Dir = dir
	if len(env) > 0 {
		cmd.Env = mergeEnv(os.Environ(), env)
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
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return false, output, nil
	}
	return false, output, err
}

func mergeEnv(base, extra []string) []string {
	out := make([]string, len(base))
	copy(out, base)
	seen := map[string]int{}
	for i, kv := range out {
		if k := keyOf(kv); k != "" {
			seen[k] = i
		}
	}
	for _, kv := range extra {
		if k := keyOf(kv); k != "" {
			if idx, ok := seen[k]; ok {
				out[idx] = kv
			} else {
				out = append(out, kv)
			}
		}
	}
	return out
}

func keyOf(kv string) string {
	for i := 0; i < len(kv); i++ {
		if kv[i] == '=' {
			return kv[:i]
		}
	}
	return ""
}

// FakeRunner is a fully offline test double. Never shells. Records calls.
type FakeRunner struct {
	mu sync.Mutex

	// Stdout is returned on every call unless ResultsByCall is set.
	Stdout string
	// ExitCode: 0 => passed, non-zero => !passed. Only used if no error.
	ExitCode int
	// Err, when non-nil, is returned as execution error (not exit).
	Err error

	// ResultsByCall overrides for specific call index (0-based).
	ResultsByCall []FakeResult

	Calls []FakeCall
}

type FakeCall struct {
	Dir  string
	Argv []string
	Env  []string
}

type FakeResult struct {
	Passed bool
	Output string
	Err    error
}

var _ Runner = (*FakeRunner)(nil)

func (f *FakeRunner) Execute(_ context.Context, dir string, argv []string, env []string) (bool, string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	idx := len(f.Calls)
	f.Calls = append(f.Calls, FakeCall{
		Dir:  dir,
		Argv: append([]string(nil), argv...),
		Env:  append([]string(nil), env...),
	})

	if idx < len(f.ResultsByCall) {
		r := f.ResultsByCall[idx]
		return r.Passed, r.Output, r.Err
	}
	if f.Err != nil {
		return false, "", f.Err
	}
	passed := f.ExitCode == 0
	return passed, f.Stdout, nil
}

// CallCount returns number of Execute invocations.
func (f *FakeRunner) CallCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.Calls)
}
