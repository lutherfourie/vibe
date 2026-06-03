package prompts

import (
	"strings"
)

// Lane is the prompt package's dependency-free view of a work lane.
type Lane struct {
	Name     string
	Mode     string
	Branch   string
	Reads    []string
	Writes   []string
	Prompt   string
	Requires []string

	// Autonomous carries the long-horizon config for a mode=="autonomous" lane.
	// It is nil for codex.web / local lanes (and ignored by their generators).
	Autonomous *Autonomous
}

// CodexWebHandoff renders a paste-ready prompt for a Codex cloud lane.
func CodexWebHandoff(planName string, repo string, lane Lane) string {
	var b strings.Builder

	b.WriteString("# Codex Web Handoff: ")
	b.WriteString(lane.Name)
	b.WriteString("\n\n")
	b.WriteString("Plan: ")
	b.WriteString(planName)
	b.WriteString("\n")
	b.WriteString("Repo: ")
	b.WriteString(repo)
	b.WriteString("\n")
	if lane.Branch != "" {
		b.WriteString("Start branch/SHA: ")
		b.WriteString(lane.Branch)
		b.WriteString("\n")
	}
	b.WriteString("Mode: codex.web\n\n")

	writeSection(&b, "Read Scope", lane.Reads)
	writeSection(&b, "Write Scope", lane.Writes)
	writeSection(&b, "Required Gates", lane.Requires)
	writeGPT55OperatingContract(&b)

	b.WriteString("## Task\n\n")
	b.WriteString(strings.TrimSpace(lane.Prompt))
	b.WriteString("\n\n")
	b.WriteString("## Boundaries\n\n")
	b.WriteString("- Stay inside the declared write scope.\n")
	b.WriteString("- Treat files outside the write scope as read-only context.\n")
	b.WriteString("- Do not make provider, toolchain, or architecture changes unless the task explicitly requires them.\n")
	b.WriteString("- Report verification performed and anything blocked by the cloud environment.\n")

	return b.String()
}

// LocalChecklist renders a local lane checklist for a human or local CLI agent.
func LocalChecklist(planName string, repo string, lane Lane) string {
	var b strings.Builder

	b.WriteString("# Local Lane Checklist: ")
	b.WriteString(lane.Name)
	b.WriteString("\n\n")
	b.WriteString("Plan: ")
	b.WriteString(planName)
	b.WriteString("\n")
	b.WriteString("Repo: ")
	b.WriteString(repo)
	b.WriteString("\n")
	if lane.Branch != "" {
		b.WriteString("Branch/worktree: ")
		b.WriteString(lane.Branch)
		b.WriteString("\n")
	}
	b.WriteString("Mode: local\n\n")

	writeSection(&b, "Read Scope", lane.Reads)
	writeSection(&b, "Write Scope", lane.Writes)
	writeSection(&b, "Required Gates", lane.Requires)
	writeGPT55OperatingContract(&b)

	b.WriteString("## Task\n\n")
	b.WriteString(strings.TrimSpace(lane.Prompt))
	b.WriteString("\n\n")
	b.WriteString("## Local Safety Checks\n\n")
	b.WriteString("- Check git status before editing.\n")
	b.WriteString("- Keep unrelated dirty files out of the lane.\n")
	b.WriteString("- Run the lane's required validation gates before merge.\n")
	b.WriteString("- Summarize changed files and residual risk.\n")

	return b.String()
}

func writeSection(b *strings.Builder, title string, items []string) {
	b.WriteString("## ")
	b.WriteString(title)
	b.WriteString("\n\n")
	if len(items) == 0 {
		b.WriteString("- None declared.\n\n")
		return
	}
	for _, item := range items {
		b.WriteString("- ")
		b.WriteString(item)
		b.WriteString("\n")
	}
	b.WriteString("\n")
}

func writeGPT55OperatingContract(b *strings.Builder) {
	b.WriteString("## GPT-5.5 Operating Contract\n\n")
	b.WriteString("### Customer-Facing Style\n\n")
	b.WriteString("- Be steady, direct, and practical; assume the user is competent.\n")
	b.WriteString("- Prefer progress over clarification when the task is clear enough and low-risk.\n")
	b.WriteString("- Ask only when missing information materially changes the outcome or creates meaningful risk.\n\n")

	b.WriteString("### Retrieval Budget\n\n")
	b.WriteString("- Start from the declared read scope and the task text.\n")
	b.WriteString("- Make another lookup only when a required file, owner, date, command, or source is missing.\n")
	b.WriteString("- Stop retrieving once the core task can be completed with useful evidence.\n\n")

	b.WriteString("### Preamble And Phase Handling\n\n")
	b.WriteString("- For multi-step or tool-heavy work, begin with a one- or two-sentence preamble naming the first step.\n")
	b.WriteString("- Preserve assistant item phases if replaying Responses API items between turns.\n")
	b.WriteString("- Use phase: \"commentary\" for progress updates and phase: \"final_answer\" for the completed answer.\n\n")

	b.WriteString("### Validation Loop\n\n")
	b.WriteString("- Run the required gates before claiming completion.\n")
	b.WriteString("- If a gate cannot run in the current environment, report the exact blocker and the next best check.\n")
	b.WriteString("- Final output should list completed actions, validation evidence, changed files, and residual risk.\n\n")
}
