package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"github.com/lutherfourie/vibe/go/internal/lanes"
)

func main() {
	if err := run(context.Background(), os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "vibe-coord:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("expected subcommand: emit")
	}

	switch args[0] {
	case "emit":
		return runEmit(ctx, args[1:])
	default:
		return fmt.Errorf("unknown subcommand %q", args[0])
	}
}

func runEmit(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("emit", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)

	planPath := flags.String("plan", "", "path to lane-plan JSON")
	outDir := flags.String("out", ".vibe-out", "directory for generated handoffs")

	if err := flags.Parse(args); err != nil {
		return err
	}
	if *planPath == "" {
		return fmt.Errorf("--plan is required")
	}

	raw, err := os.ReadFile(*planPath)
	if err != nil {
		return fmt.Errorf("read plan: %w", err)
	}

	var plan lanes.Plan
	if err := json.Unmarshal(raw, &plan); err != nil {
		return fmt.Errorf("parse plan JSON: %w", err)
	}

	result, err := lanes.EmitHandoffs(ctx, plan, *outDir)
	if err != nil {
		return err
	}

	for _, handoff := range result.Handoffs {
		fmt.Printf("%s\t%s\t%s\n", handoff.Mode, handoff.LaneName, handoff.Path)
	}

	return nil
}
