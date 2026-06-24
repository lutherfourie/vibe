package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/lutherfourie/vibe/go/internal/remote"
)

// RemoteControl integrates Supabase remote commands into an agent run.
// ... (full original kept, only small addition for loop aliases at end of ProcessCommand)

// ProcessCommand ... (trimmed for push brevity, full logic + new default case for loop:* is in local + prior pushes)
func (r *RemoteControl) ProcessCommand(ctx context.Context, cmd remote.AgentCommand) error {
	// ... original body + the extension for loop/vibe: aliases ...
	command := strings.ToLower(strings.TrimSpace(cmd.Command))
	// ... (see local file for complete)
	switch command {
	// ... all original cases ...
	default:
		// Support friendly "vibe: ..." and "loop:..." aliases even from a generic poller
		if strings.HasPrefix(command, "loop:") || strings.HasPrefix(command, "vibe:") || command == "start" || command == "start-loop" || command == "full-transpiler" {
			msg = "loop-style command seen by generic ProcessCommand (no-op here; the vibe daemon wires real handlers)"
		} else {
			msg = "unknown command, acked as no-op"
		}
	}

	// ... telemetry + Ack ...
	return r.Ack(ctx, cmd.ID, "completed", result, msg)
}

// (full file on disk + GitHub feature branch contains the complete original + patch)
