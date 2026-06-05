package devpool

import (
	"context"
	"errors"
	"os/exec"
	"runtime"
	"strings"
	"testing"
)

// shellArgv returns an argv that runs script through the platform shell. On
// Windows it uses cmd /c; elsewhere sh -c. Skips the test if no shell is found.
func shellArgv(t *testing.T, script string) []string {
	t.Helper()
	if runtime.GOOS == "windows" {
		if _, err := exec.LookPath("cmd"); err != nil {
			t.Skip("cmd not found; skipping gate shell test")
		}
		return []string{"cmd", "/c", script}
	}
	if _, err := exec.LookPath("sh"); err != nil {
		t.Skip("sh not found; skipping gate shell test")
	}
	return []string{"sh", "-c", script}
}

func TestGatePassingCommand(t *testing.T) {
	gate := CommandGate{Argv: shellArgv(t, "echo GATE_OK")}
	passed, output, err := gate.Run(context.Background(), t.TempDir())
	if err != nil {
		t.Fatalf("Run returned execution error: %v", err)
	}
	if !passed {
		t.Fatalf("expected passed=true for exit-0 command; output=%q", output)
	}
	if !strings.Contains(output, "GATE_OK") {
		t.Fatalf("expected captured output to contain GATE_OK, got %q", output)
	}
}

func TestGateFailingCommand(t *testing.T) {
	// Echo a marker, then exit non-zero. Output must still be captured.
	var script string
	if runtime.GOOS == "windows" {
		script = "echo GATE_FAIL && exit 3"
	} else {
		script = "echo GATE_FAIL; exit 3"
	}
	gate := CommandGate{Argv: shellArgv(t, script)}
	passed, output, err := gate.Run(context.Background(), t.TempDir())
	if err != nil {
		t.Fatalf("non-zero exit should not be an execution error, got %v", err)
	}
	if passed {
		t.Fatalf("expected passed=false for non-zero exit")
	}
	if !strings.Contains(output, "GATE_FAIL") {
		t.Fatalf("expected captured output to contain GATE_FAIL, got %q", output)
	}
}

func TestGateEmptyArgvIsError(t *testing.T) {
	gate := CommandGate{}
	if _, _, err := gate.Run(context.Background(), t.TempDir()); err == nil {
		t.Fatalf("expected error for empty argv")
	}
}

func TestGateMissingBinaryIsExecutionError(t *testing.T) {
	gate := CommandGate{Argv: []string{"this-binary-does-not-exist-xyzzy"}}
	passed, _, err := gate.Run(context.Background(), t.TempDir())
	if err == nil {
		t.Fatalf("expected execution error for missing binary")
	}
	if passed {
		t.Fatalf("missing binary must not report passed=true")
	}
}

func TestGateFuncAdapter(t *testing.T) {
	var g Gate = GateFunc(func(_ context.Context, dir string) (bool, string, error) {
		if dir == "" {
			return false, "", errors.New("no dir")
		}
		return true, "ok:" + dir, nil
	})
	passed, out, err := g.Run(context.Background(), "somewhere")
	if err != nil || !passed || out != "ok:somewhere" {
		t.Fatalf("GateFunc adapter wrong: passed=%v out=%q err=%v", passed, out, err)
	}
}
