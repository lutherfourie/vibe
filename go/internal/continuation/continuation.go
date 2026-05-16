package continuation

import (
	"fmt"
	"strings"
)

type Command struct {
	Purpose string `json:"purpose"`
	Value   string `json:"value"`
}

type Report struct {
	RepoRoot     string    `json:"repoRoot"`
	Branch       string    `json:"branch"`
	Upstream     string    `json:"upstream,omitempty"`
	Clean        bool      `json:"clean"`
	ChangedPaths []string  `json:"changedPaths,omitempty"`
	PlanName     string    `json:"planName,omitempty"`
	PlanSource   string    `json:"planSource,omitempty"`
	LaneCount    int       `json:"laneCount,omitempty"`
	ReadFirst    []string  `json:"readFirst"`
	Commands     []Command `json:"commands"`
	NextMoves    []string  `json:"nextMoves"`
}

func DefaultReadFirst() []string {
	return []string{
		"docs/continue.md",
		"docs/fresh-start.md",
		"docs/bootstrap-todos.md",
		"docs/local-toolkit.md",
		"docs/examples/vibe-self-plan.json",
	}
}

func DefaultCommands() []Command {
	return []Command{
		{Purpose: "Orient", Value: "pnpm run vibe:continue"},
		{Purpose: "Check tools", Value: "pnpm run vibe:doctor"},
		{Purpose: "List lanes", Value: "pnpm run vibe:lanes"},
		{Purpose: "Verify TypeScript and extension", Value: "pnpm run check"},
		{Purpose: "Verify Go", Value: "cd go && go test ./..."},
	}
}

func DefaultNextMoves() []string {
	return []string{
		"If PR #2 is still draft, review it and mark it ready before merging to main.",
		"After PR #2 merges, close PR #1 as superseded by the main integration PR.",
		"Pick one lane from `pnpm run vibe:lanes`, give it a branch and write scope, then update `docs/continue.md` before handing off.",
	}
}

func Markdown(report Report) string {
	var b strings.Builder
	b.WriteString("# Vibe Continue\n\n")
	if report.RepoRoot != "" {
		fmt.Fprintf(&b, "Repo: `%s`\n", report.RepoRoot)
	}
	if report.Branch != "" {
		fmt.Fprintf(&b, "Branch: `%s`", report.Branch)
		if report.Upstream != "" {
			fmt.Fprintf(&b, " -> `%s`", report.Upstream)
		}
		b.WriteString("\n")
	}
	if report.Clean {
		b.WriteString("Status: clean\n")
	} else {
		fmt.Fprintf(&b, "Status: dirty (%d changed paths)\n", len(report.ChangedPaths))
	}
	if report.PlanName != "" {
		fmt.Fprintf(&b, "Self-plan: `%s`", report.PlanName)
		if report.PlanSource != "" {
			fmt.Fprintf(&b, " from `%s`", report.PlanSource)
		}
		if report.LaneCount > 0 {
			fmt.Fprintf(&b, " (%d lanes)", report.LaneCount)
		}
		b.WriteString("\n")
	}

	writeList(&b, "Read First", report.ReadFirst)

	if len(report.Commands) > 0 {
		b.WriteString("\n## Resume Commands\n\n")
		for _, command := range report.Commands {
			if command.Purpose == "" {
				fmt.Fprintf(&b, "- `%s`\n", command.Value)
				continue
			}
			fmt.Fprintf(&b, "- %s: `%s`\n", command.Purpose, command.Value)
		}
	}

	writePlainList(&b, "Next Moves", report.NextMoves)

	if !report.Clean && len(report.ChangedPaths) > 0 {
		writeList(&b, "Changed Paths", report.ChangedPaths)
	}
	return b.String()
}

func writeList(b *strings.Builder, title string, items []string) {
	if len(items) == 0 {
		return
	}
	fmt.Fprintf(b, "\n## %s\n\n", title)
	for _, item := range items {
		fmt.Fprintf(b, "- `%s`\n", item)
	}
}

func writePlainList(b *strings.Builder, title string, items []string) {
	if len(items) == 0 {
		return
	}
	fmt.Fprintf(b, "\n## %s\n\n", title)
	for _, item := range items {
		fmt.Fprintf(b, "- %s\n", item)
	}
}
