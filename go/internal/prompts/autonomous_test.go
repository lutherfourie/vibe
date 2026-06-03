package prompts

import (
	"strings"
	"testing"
)

func TestAutonomousHandoffEmbedsOperatingContract(t *testing.T) {
	handoff := AutonomousHandoff("vibe-demo", "C:/vibe", Lane{
		Name:     "agent-sdk-hardening",
		Mode:     "autonomous",
		Branch:   "feat/agent-sdk-hardening",
		Reads:    []string{"go/agent/**"},
		Writes:   []string{"go/agent/**"},
		Requires: []string{"go test ./..."},
		Prompt:   "Harden the agent SDK.",
		Autonomous: &Autonomous{
			Progress:        "PROGRESS.md",
			Horizon:         "long",
			CheckpointEvery: "every major step",
			Roles:           []string{"architect", "implementer", "researcher", "tester", "reviewer", "devops"},
			Research:        "docs/superpowers/research",
		},
	})

	requireAll(t, handoff,
		"# Autonomous Lane: agent-sdk-hardening",
		"Mode: autonomous",
		"Horizon: long",
		"## Write Scope",
		"go/agent/**",
		"## Required Gates",
		"go test ./...",
		"## Autonomous Operating Contract",
		"### Core Authorization",
		"### Startup & Resumption Protocol",
		"`git pull`",
		"### Structured Workflow Loop",
		"**Explore**",
		"**Research**",
		"**Plan**",
		"**Implement**",
		"**Verify**",
		"**Test**",
		"**Commit & Handoff**",
		"### Multi-Agent Roles",
		"**Architect** —",
		"**Devops** —",
		"### Branching & Experimentation",
		"### Persistence & Long-Horizon Rules",
		"every major step",
		"### PROGRESS.md Contract",
		"Checkpoint Log",
		"## Task\n\nHarden the agent SDK.",
		"## Boundaries",
		"Update `PROGRESS.md` before you stop",
		"docs/superpowers/research",
	)
}

func TestAutonomousHandoffAppliesDefaults(t *testing.T) {
	// A lane with mode autonomous but no Autonomous block must still render a
	// complete, usable contract via defaults (progress path, role set, cadence).
	handoff := AutonomousHandoff("p", "C:/vibe", Lane{
		Name:   "bare",
		Mode:   "autonomous",
		Prompt: "Do durable work.",
	})

	requireAll(t, handoff,
		"# Autonomous Lane: bare",
		"`PROGRESS.md`",
		defaultCheckpointEvery,
		"**Architect** —",
		"**Implementer** —",
		"**Researcher** —",
		"**Tester** —",
		"**Reviewer** —",
		"**Devops** —",
	)

	// With no Horizon set, the header line must be omitted entirely.
	if strings.Contains(handoff, "Horizon:") {
		t.Fatalf("expected no Horizon header when none is declared:\n%s", handoff)
	}
	// With no research dir, the generic Research step must appear.
	if !strings.Contains(handoff, "record findings before coding") {
		t.Fatalf("expected the generic Research step when no research dir is set:\n%s", handoff)
	}
}

func TestAutonomousHandoffRendersCustomRole(t *testing.T) {
	handoff := AutonomousHandoff("p", "C:/vibe", Lane{
		Name:       "custom",
		Mode:       "autonomous",
		Prompt:     "x",
		Autonomous: &Autonomous{Roles: []string{"security-auditor"}},
	})
	// An unknown role renders its title without inventing a charter.
	if !strings.Contains(handoff, "- **Security-auditor**\n") {
		t.Fatalf("expected a custom role rendered verbatim:\n%s", handoff)
	}
}
