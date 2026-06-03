package progress

import (
	"strings"
	"testing"
)

func sampleDoc() Doc {
	return Doc{
		Title:      "Vibe — Autonomous",
		Status:     "in-progress — PR 2",
		Updated:    "2026-06-03",
		Branch:     "feat/vibe-progress-checkpoint",
		Mission:    "Make long-horizon work first-class.",
		Milestones: []string{"[x] design", "[ ] implement"},
		Checkpoints: []Checkpoint{
			{Time: "2026-06-03", Summary: "second", Notes: []string{"did B", "then C"}},
			{Time: "2026-06-02", Summary: "first", Notes: []string{"did A"}},
		},
		NextMoves: []string{"wire the CLI", "open the PR"},
		Decisions: []string{"inject the clock: determinism"},
		Risks:     []string{"none"},
		Resume:    []string{"read the spec", "run go test ./..."},
	}
}

func TestRenderParseRoundTrip(t *testing.T) {
	doc := sampleDoc()
	rendered := Render(doc)

	parsed, err := Parse(rendered)
	if err != nil {
		t.Fatalf("parse rendered doc: %v", err)
	}
	// Re-rendering the parsed doc must be byte-identical: Render/Parse are inverses.
	if again := Render(parsed); again != rendered {
		t.Fatalf("round-trip not idempotent:\n--- first ---\n%s\n--- again ---\n%s", rendered, again)
	}

	if parsed.Title != doc.Title {
		t.Errorf("title: got %q want %q", parsed.Title, doc.Title)
	}
	if parsed.Status != doc.Status {
		t.Errorf("status: got %q want %q", parsed.Status, doc.Status)
	}
	if parsed.Branch != doc.Branch {
		t.Errorf("branch: got %q want %q", parsed.Branch, doc.Branch)
	}
	if len(parsed.Checkpoints) != 2 || parsed.Checkpoints[0].Summary != "second" {
		t.Fatalf("checkpoints not parsed: %#v", parsed.Checkpoints)
	}
	if len(parsed.Checkpoints[0].Notes) != 2 || parsed.Checkpoints[0].Notes[1] != "then C" {
		t.Errorf("checkpoint notes: %#v", parsed.Checkpoints[0].Notes)
	}
	if len(parsed.NextMoves) != 2 || parsed.NextMoves[0] != "wire the CLI" {
		t.Errorf("next moves: %#v", parsed.NextMoves)
	}
	if len(parsed.Milestones) != 2 || parsed.Milestones[0] != "[x] design" {
		t.Errorf("milestones: %#v", parsed.Milestones)
	}
}

func TestAppendCheckpointInsertsAtHeadAndRefreshesFrontBlock(t *testing.T) {
	base := Render(sampleDoc())

	out, err := AppendCheckpoint(base, Checkpoint{
		Time:    "2026-06-04",
		Summary: "third",
		Notes:   []string{"newest note"},
	}, "in-progress — PR 2 verified")
	if err != nil {
		t.Fatalf("append: %v", err)
	}

	// Front-block refreshed.
	if !strings.Contains(out, "Updated: 2026-06-04") {
		t.Errorf("Updated not refreshed:\n%s", out)
	}
	if !strings.Contains(out, "Status: in-progress — PR 2 verified") {
		t.Errorf("Status not refreshed:\n%s", out)
	}

	// New entry is at the head of the log (before the previous newest "second").
	parsed, err := Parse(out)
	if err != nil {
		t.Fatalf("parse appended: %v", err)
	}
	if len(parsed.Checkpoints) != 3 {
		t.Fatalf("expected 3 checkpoints, got %d", len(parsed.Checkpoints))
	}
	if parsed.Checkpoints[0].Summary != "third" {
		t.Errorf("newest checkpoint should be first, got %q", parsed.Checkpoints[0].Summary)
	}
	if parsed.Checkpoints[1].Summary != "second" {
		t.Errorf("prior checkpoints should be preserved in order, got %q", parsed.Checkpoints[1].Summary)
	}

	// Surgical: everything else is preserved (mission, decisions, resume).
	for _, want := range []string{"Make long-horizon work first-class.", "inject the clock: determinism", "run go test ./..."} {
		if !strings.Contains(out, want) {
			t.Errorf("surgical append dropped content %q", want)
		}
	}
}

func TestAppendCheckpointScaffoldsEmpty(t *testing.T) {
	out, err := AppendCheckpoint("", Checkpoint{Time: "2026-06-03", Summary: "first ever"}, "started")
	if err != nil {
		t.Fatalf("append to empty: %v", err)
	}
	doc, err := Parse(out)
	if err != nil {
		t.Fatalf("parse scaffolded: %v", err)
	}
	if doc.Status != "started" {
		t.Errorf("status: got %q", doc.Status)
	}
	if doc.Updated != "2026-06-03" {
		t.Errorf("updated: got %q", doc.Updated)
	}
	if len(doc.Checkpoints) != 1 || doc.Checkpoints[0].Summary != "first ever" {
		t.Fatalf("checkpoint: %#v", doc.Checkpoints)
	}
}

func TestParseToleratesHandWrittenVariants(t *testing.T) {
	// Front-block missing Status; a `## Status` section instead; plain-hyphen
	// checkpoint head; an unknown section that must be ignored.
	md := strings.Join([]string{
		"# Hand Written",
		"",
		"Updated: 2026-06-01",
		"Branch: main",
		"",
		"## Status",
		"",
		"actively hacking",
		"",
		"## Mission",
		"",
		"do the thing",
		"",
		"## Checkpoint Log",
		"",
		"### 2026-06-01 - kickoff",
		"- started",
		"",
		"## Notes That Are Not In The Contract",
		"",
		"- ignore me",
		"",
		"## Resume",
		"",
		"- read this",
	}, "\n")

	doc, err := Parse(md)
	if err != nil {
		t.Fatalf("parse hand-written: %v", err)
	}
	if doc.Title != "Hand Written" {
		t.Errorf("title: %q", doc.Title)
	}
	if doc.Status != "actively hacking" {
		t.Errorf("status should fall back to the ## Status section, got %q", doc.Status)
	}
	if len(doc.Checkpoints) != 1 || doc.Checkpoints[0].Time != "2026-06-01" || doc.Checkpoints[0].Summary != "kickoff" {
		t.Fatalf("plain-hyphen checkpoint head not parsed: %#v", doc.Checkpoints)
	}
	if len(doc.Resume) != 1 || doc.Resume[0] != "read this" {
		t.Errorf("resume: %#v", doc.Resume)
	}
}

func TestScaffoldIsRenderable(t *testing.T) {
	doc := Scaffold("My Lane", "north star")
	out := Render(doc)
	for _, want := range []string{"# My Lane", "Status: in-progress", "## Mission", "north star", "## Checkpoint Log", "## Resume"} {
		if !strings.Contains(out, want) {
			t.Errorf("scaffold render missing %q:\n%s", want, out)
		}
	}
}
