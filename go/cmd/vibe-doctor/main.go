package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"github.com/lutherfourie/vibe/go/internal/doctor"
)

func main() {
	if err := run(context.Background(), os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "vibe-doctor:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("vibe-doctor", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)

	jsonOut := flags.Bool("json", false, "write machine-readable JSON")

	if err := flags.Parse(args); err != nil {
		return err
	}

	report := doctor.Run(ctx, doctor.DefaultRequirements())
	if *jsonOut {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(report)
	}

	fmt.Print(doctor.Markdown(report))
	if !report.OK {
		return fmt.Errorf("required checks failed")
	}
	return nil
}
