package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/lutherfourie/vibe/go/internal/bootstrap"
)

func main() {
	if err := run(context.Background(), os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "vibe-make:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("expected subcommand: plan")
	}
	switch args[0] {
	case "plan":
		return runPlan(ctx, args[1:])
	default:
		return fmt.Errorf("unknown subcommand %q", args[0])
	}
}

func runPlan(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("plan", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)

	repo := flags.String("repo", ".", "repo root for the generated Vibe self-making plan")
	outPath := flags.String("out", "", "optional path to write JSON plan")

	if err := flags.Parse(args); err != nil {
		return err
	}

	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	plan := bootstrap.SelfMakingPlan(*repo)
	raw, err := json.MarshalIndent(plan, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal plan: %w", err)
	}
	raw = append(raw, '\n')

	if *outPath == "" {
		_, err := os.Stdout.Write(raw)
		return err
	}

	dir := filepath.Dir(*outPath)
	if dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("create output directory: %w", err)
		}
	}
	if err := os.WriteFile(*outPath, raw, 0o644); err != nil {
		return fmt.Errorf("write plan: %w", err)
	}
	fmt.Println(*outPath)
	return nil
}
