package prompts

import (
	"strings"
	"testing"
)

func TestCodexWebHandoffIncludesGPT55OperatingContract(t *testing.T) {
	handoff := CodexWebHandoff("plan", "C:/Repo", Lane{
		Name:     "docs",
		Mode:     "codex.web",
		Reads:    []string{"README.md"},
		Writes:   []string{"docs/**"},
		Requires: []string{"pnpm run check"},
		Prompt:   "Update docs.",
	})

	requireAll(t, handoff,
		"## GPT-5.5 Operating Contract",
		"Customer-Facing Style",
		"Retrieval Budget",
		"Preamble And Phase Handling",
		"Validation Loop",
		"phase: \"commentary\"",
		"phase: \"final_answer\"",
	)
}

func TestLocalChecklistIncludesGPT55OperatingContract(t *testing.T) {
	checklist := LocalChecklist("plan", "C:/Repo", Lane{
		Name:     "runtime",
		Mode:     "local",
		Reads:    []string{"go/**"},
		Writes:   []string{"go/**"},
		Requires: []string{"go test ./..."},
		Prompt:   "Update runtime.",
	})

	requireAll(t, checklist,
		"## GPT-5.5 Operating Contract",
		"Customer-Facing Style",
		"Retrieval Budget",
		"Preamble And Phase Handling",
		"Validation Loop",
		"phase: \"commentary\"",
		"phase: \"final_answer\"",
	)
}

func requireAll(t *testing.T, text string, needles ...string) {
	t.Helper()
	for _, needle := range needles {
		if !strings.Contains(text, needle) {
			t.Fatalf("expected text to contain %q:\n%s", needle, text)
		}
	}
}
