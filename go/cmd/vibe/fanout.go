package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/lutherfourie/vibe/go/agent"
	"github.com/lutherfourie/vibe/go/internal/fanout"
)

// runFanout fans a single prompt across multiple subagent providers concurrently
// (agent.SpawnParallel) and reports each result, optionally picking the best and
// writing each to a file. This is the CLI keystone for multi-subagent fan-out
// (M3); see docs/adr/0001-continuous-fanout-dev-pool.md.
//
// SAFETY: codex runs read-only; grok-cli runs with --always-approve and CAN edit
// files if --cwd points at a writable repo and the prompt asks. Prefer analysis
// prompts (or a sandbox --cwd) until the gated dev-pool (later slices) lands.
func runFanout(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("fanout", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	providersCSV := flags.String("providers", "cerebras,codex", "comma-separated subagents ("+strings.Join(fanout.Names(), ", ")+")")
	prompt := flags.String("prompt", "", "prompt text (or use --prompt-file)")
	promptFile := flags.String("prompt-file", "", "read the prompt from a file instead of --prompt")
	system := flags.String("system", "", "optional system message")
	cwd := flags.String("cwd", "", "working directory for CLI subagents (codex/grok-cli)")
	outDir := flags.String("out", "", "optional directory to write <provider>.md result files")
	best := flags.Bool("best", false, "also print the PickBest winner")
	jsonOut := flags.Bool("json", false, "machine-readable JSON output")
	if err := flags.Parse(args); err != nil {
		return err
	}

	text := *prompt
	if strings.TrimSpace(*promptFile) != "" {
		raw, err := os.ReadFile(resolveRepoPath(*promptFile))
		if err != nil {
			return fmt.Errorf("read prompt-file: %w", err)
		}
		text = string(raw)
	}
	if strings.TrimSpace(text) == "" {
		return fmt.Errorf("--prompt or --prompt-file is required")
	}

	providers, labels, err := fanout.Resolve(strings.Split(*providersCSV, ","))
	if err != nil {
		return err
	}

	var messages []agent.Message
	if strings.TrimSpace(*system) != "" {
		messages = append(messages, agent.Message{Role: agent.RoleSystem, Content: *system})
	}
	messages = append(messages, agent.Message{Role: agent.RoleUser, Content: text})
	req := agent.TurnRequest{Messages: messages, Cwd: *cwd}

	fmt.Fprintf(os.Stderr, "vibe fanout: %d subagent(s) [%s] on a %d-char prompt...\n", len(providers), strings.Join(labels, ", "), len(text))
	results := agent.SpawnParallel(ctx, providers, req)
	summaries := fanout.Summarize(results, labels)

	winner := ""
	if *best {
		if idx, ok := agent.PickBestIndex(results); ok {
			winner = summaries[idx].Provider
		}
	}

	if strings.TrimSpace(*outDir) != "" {
		if err := writeFanoutFiles(resolveRepoPathForWrite(*outDir), summaries); err != nil {
			return err
		}
	}

	return fanout.Render(os.Stdout, summaries, winner, *jsonOut)
}

func writeFanoutFiles(dir string, summaries []fanout.Result) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create out dir: %w", err)
	}
	for _, s := range summaries {
		name := s.Provider
		if name == "" {
			name = "unknown"
		}
		body := s.Text
		if !s.OK {
			body = "ERROR: " + s.Err
		}
		path := filepath.Join(dir, name+".md")
		if err := os.WriteFile(path, []byte(strings.TrimRight(body, "\n")+"\n"), 0o644); err != nil {
			return fmt.Errorf("write %s: %w", path, err)
		}
		fmt.Fprintf(os.Stderr, "  wrote %s\n", path)
	}
	return nil
}
