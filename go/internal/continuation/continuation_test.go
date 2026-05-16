package continuation

import (
	"strings"
	"testing"
)

func TestMarkdownGivesACompactResumeProtocol(t *testing.T) {
	report := Report{
		RepoRoot:   "C:/vibe",
		Branch:     "codex/main-transfer-integration",
		Upstream:   "origin/codex/main-transfer-integration",
		Clean:      true,
		PlanName:   "vibe-self",
		PlanSource: "examples/vibe-self.vibe",
		LaneCount:  7,
		ReadFirst: []string{
			"docs/continue.md",
			"docs/fresh-start.md",
		},
		Commands: []Command{
			{Purpose: "Orient", Value: "pnpm run vibe:continue"},
			{Purpose: "Verify", Value: "pnpm run check"},
		},
		NextMoves: []string{
			"Pick one lane from `pnpm run vibe:lanes`.",
		},
	}

	out := Markdown(report)

	for _, expected := range []string{
		"# Vibe Continue",
		"Repo: `C:/vibe`",
		"Branch: `codex/main-transfer-integration` -> `origin/codex/main-transfer-integration`",
		"Status: clean",
		"Self-plan: `vibe-self` from `examples/vibe-self.vibe` (7 lanes)",
		"- `docs/continue.md`",
		"- Orient: `pnpm run vibe:continue`",
		"- Pick one lane from `pnpm run vibe:lanes`.",
	} {
		if !strings.Contains(out, expected) {
			t.Fatalf("expected markdown to contain %q\n\n%s", expected, out)
		}
	}
}
