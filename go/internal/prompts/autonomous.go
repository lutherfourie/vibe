package prompts

import (
	"fmt"
	"strings"
)

// Autonomous mirrors lanes.Autonomous without importing the lanes package, so
// the prompts package stays dependency-free of the runtime IR.
type Autonomous struct {
	Progress        string
	Horizon         string
	CheckpointEvery string
	Roles           []string
	Research        string
}

const (
	defaultProgressPath    = "PROGRESS.md"
	defaultCheckpointEvery = "every major step or 30-60 minutes"
)

// defaultRoles is the standard multi-agent rotation when a lane declares none.
func defaultRoles() []string {
	return []string{"architect", "implementer", "researcher", "tester", "reviewer", "devops"}
}

// AutonomousHandoff renders the long-horizon operating contract for a
// mode=="autonomous" lane: a generated, scoped, durable brief embedding the
// Explore -> Research -> Plan -> Implement -> Verify -> Test -> Commit loop, the
// startup/resumption protocol, and the PROGRESS.md contract — so a fresh agent
// or session can adopt the lane and run it to completion without losing scope.
//
// The output is deterministic (no clock, no randomness) and paste-ready.
func AutonomousHandoff(planName string, repo string, lane Lane) string {
	auto := Autonomous{}
	if lane.Autonomous != nil {
		auto = *lane.Autonomous
	}

	progress := strings.TrimSpace(auto.Progress)
	if progress == "" {
		progress = defaultProgressPath
	}
	roles := auto.Roles
	if len(roles) == 0 {
		roles = defaultRoles()
	}
	cadence := strings.TrimSpace(auto.CheckpointEvery)
	if cadence == "" {
		cadence = defaultCheckpointEvery
	}

	var b strings.Builder

	b.WriteString("# Autonomous Lane: ")
	b.WriteString(lane.Name)
	b.WriteString("\n\n")
	fmt.Fprintf(&b, "Plan: %s\n", planName)
	fmt.Fprintf(&b, "Repo: %s\n", repo)
	if lane.Branch != "" {
		fmt.Fprintf(&b, "Branch/worktree: %s\n", lane.Branch)
	}
	b.WriteString("Mode: autonomous\n")
	if h := strings.TrimSpace(auto.Horizon); h != "" {
		fmt.Fprintf(&b, "Horizon: %s\n", h)
	}
	b.WriteString("\n")

	writeSection(&b, "Read Scope", lane.Reads)
	writeSection(&b, "Write Scope", lane.Writes)
	writeSection(&b, "Required Gates", lane.Requires)

	writeAutonomousOperatingContract(&b, progress, roles, cadence, strings.TrimSpace(auto.Research))

	b.WriteString("## Task\n\n")
	b.WriteString(strings.TrimSpace(lane.Prompt))
	b.WriteString("\n\n")

	b.WriteString("## Boundaries\n\n")
	b.WriteString("- Stay inside the declared write scope; treat everything else as read-only context.\n")
	b.WriteString("- Make no provider, toolchain, or architecture change unless the task explicitly requires it.\n")
	b.WriteString("- Everything important must survive session boundaries via git + files.\n")
	fmt.Fprintf(&b, "- Update `%s` before you stop — it is the single source of truth for the next session.\n", progress)
	b.WriteString("- Report verification performed, changed files, and residual risk.\n")

	return b.String()
}

func writeAutonomousOperatingContract(b *strings.Builder, progress string, roles []string, cadence string, research string) {
	b.WriteString("## Autonomous Operating Contract\n\n")
	b.WriteString("You are a fully autonomous senior engineer on this lane with complete authorization inside the write scope. Work durably across long time horizons; the user may return much later, so make everything recoverable via git and files.\n\n")

	b.WriteString("### Core Authorization\n\n")
	b.WriteString("- Full git, file, and tool access **within the write scope**: branch, commit, edit, and create as needed.\n")
	b.WriteString("- Spend tokens and reasoning effort generously; prioritize depth, correctness, and verification over brevity.\n")
	b.WriteString("- High agency: if something clearly improves the lane (tests, docs, automation), do it.\n\n")

	b.WriteString("### Startup & Resumption Protocol (always first)\n\n")
	b.WriteString("1. `git pull` and `git status`.\n")
	fmt.Fprintf(b, "2. Read `%s` (create it if missing), then `README.md`, key architecture docs, recent commit messages, and `CLAUDE.md`.\n", progress)
	b.WriteString("3. Resume cleanly from the last checkpoint. Never restart from scratch if state already exists.\n\n")

	b.WriteString("### Structured Workflow Loop\n\n")
	b.WriteString("Run this loop explicitly for every significant slice:\n\n")
	b.WriteString("1. **Explore** — understand the relevant files, dependencies, and context.\n")
	if research != "" {
		fmt.Fprintf(b, "2. **Research** — for anything non-trivial, gather docs, examples, and proven recipes; record findings under `%s` before coding.\n", research)
	} else {
		b.WriteString("2. **Research** — for anything non-trivial, gather docs, examples, and proven recipes; record findings before coding.\n")
	}
	b.WriteString("3. **Plan** — break the work into small, verifiable steps; note edge cases and the test strategy.\n")
	b.WriteString("4. **Implement** — focused, incremental changes; prefer small commits.\n")
	b.WriteString("5. **Verify** — switch to a reviewer perspective; critique correctness, security, performance, and readability; fix before proceeding.\n")
	b.WriteString("6. **Test** — run the Required Gates above (or report the exact blocker and the next best check).\n")
	fmt.Fprintf(b, "7. **Commit & Handoff** — clear commit messages; update `%s` with status, decisions, and next steps.\n\n", progress)

	b.WriteString("### Multi-Agent Roles\n\n")
	fmt.Fprintf(b, "Rotate through these perspectives explicitly; use native sub-agents for independent research or review, then merge findings back into `%s`:\n\n", progress)
	for _, role := range roles {
		b.WriteString("- ")
		b.WriteString(roleLine(role))
		b.WriteString("\n")
	}
	b.WriteString("\n")

	b.WriteString("### Branching & Experimentation\n\n")
	b.WriteString("- Keep the primary branch shippable; do lane work on a short-lived feature branch.\n")
	b.WriteString("- Merge back only after self-review and the Required Gates pass.\n")
	b.WriteString("- Push the branch for backup so the work survives a lost session. Branching is cheap and reversible.\n\n")

	b.WriteString("### Persistence & Long-Horizon Rules\n\n")
	fmt.Fprintf(b, "- Checkpoint %s, and at every natural boundary (slice complete, blocker, phase end).\n", cadence)
	fmt.Fprintf(b, "- `%s` is the single source of truth for handoff; leave it clean and current whenever you stop.\n", progress)
	b.WriteString("- If re-invoked by a script, timer, or fresh session, always run the Startup & Resumption Protocol first.\n\n")

	b.WriteString("### PROGRESS.md Contract\n\n")
	fmt.Fprintf(b, "`%s` is the durable spine of this lane. Keep these sections current so any agent can resume:\n\n", progress)
	b.WriteString("- **Mission** — the durable north star for the lane.\n")
	b.WriteString("- **Status** — one-line current state + phase.\n")
	b.WriteString("- **Milestones** — checkbox list of major steps.\n")
	b.WriteString("- **Checkpoint Log** — timestamped entries: what changed, decisions, next.\n")
	b.WriteString("- **Next Moves** — the ordered list of what to do next.\n")
	b.WriteString("- **Decisions** — each decision with its rationale.\n")
	b.WriteString("- **Risks / Blockers** — open risks (may be empty).\n")
	b.WriteString("- **Resume** — exact files to read first and commands to run.\n\n")

	b.WriteString("### Resource Strategy (economy & smart delegation)\n\n")
	b.WriteString("Before any significant external delegation (CLI calls to Claude, Codex, Grok, Cerebras, big-AGI, etc.), consult the ResourceAwareDispatcher (see go/internal/resource/dispatcher.go).\n\n")
	b.WriteString("- Query current `provider_quotas` from Supabase (remaining, cost_per_million, reset_at, priority).\n")
	b.WriteString("- Estimate rough token cost of the upcoming task using EstimateTaskCost (prompt length + type heuristics).\n")
	b.WriteString("- Call Recommend() to get the lowest-score provider. Log the choice + reasoning with LogDecision().\n")
	b.WriteString("- Prefer the recommended provider for the next step unless it would exhaust quota or exceed risk tolerance.\n")
	b.WriteString("- Record the decision in the next PROGRESS.md checkpoint under 'Decisions'.\n")
	b.WriteString("- If no viable provider, fall back to cheapest local simulation or human escalation and note it.\n\n")
	b.WriteString("Audit log format example:\n")
	b.WriteString("[ResourceDispatcher] For task \"implement X\" chose grok (score=0.0123, est_cost=$0.0045, reason: lowest cost + high remaining, left=950000)\n\n")
}

// roleLine renders one multi-agent role as a bolded name plus a one-line charter.
// Known roles get a charter; custom roles render the name verbatim.
func roleLine(role string) string {
	key := strings.ToLower(strings.TrimSpace(role))
	charters := map[string]string{
		"architect":   "high-level design, interfaces, data models, and long-term implications.",
		"implementer": "clean, idiomatic, incremental code.",
		"researcher":  "external knowledge; evaluate options and pitfalls before committing.",
		"tester":      "tests, edge cases, breakage risks, and verification.",
		"validator":   "tests, edge cases, breakage risks, and verification.",
		"reviewer":    "ruthless critique of correctness, security, and quality.",
		"devops":      "branching strategy, automation, scripts, and CI considerations.",
		"workflow":    "branching strategy, automation, scripts, and CI considerations.",
	}
	title := role
	if key != "" {
		title = strings.ToUpper(key[:1]) + key[1:]
	}
	if charter, ok := charters[key]; ok {
		return fmt.Sprintf("**%s** — %s", title, charter)
	}
	return fmt.Sprintf("**%s**", title)
}
