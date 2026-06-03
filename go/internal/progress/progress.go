// Package progress is the Vibe-owned contract for PROGRESS.md — the durable,
// resume-from-checkpoint state file of a long-horizon (autonomous) lane.
//
// A PROGRESS.md is both human-readable markdown and a structured artifact: Doc
// is its parsed form, Render is the canonical writer, Parse is the tolerant
// reader, and AppendCheckpoint is the surgical "log one more checkpoint" engine
// behind `vibe checkpoint`. The package never reads the clock — callers inject
// timestamps — so rendering is deterministic and unit-testable.
package progress

import (
	"fmt"
	"strings"
)

// Checkpoint is one timestamped entry in the Checkpoint Log.
type Checkpoint struct {
	Time    string   // heading stamp (e.g. "2026-06-03"); injected by the caller
	Summary string   // short title after the stamp
	Notes   []string // bullet lines under the entry
}

// Doc is the structured form of a PROGRESS.md file.
type Doc struct {
	Title       string
	Status      string
	Updated     string
	Branch      string
	Mission     string
	Milestones  []string
	Checkpoints []Checkpoint
	NextMoves   []string
	Decisions   []string
	Risks       []string
	Resume      []string
}

const (
	secMission     = "Mission"
	secMilestones  = "Milestones"
	secCheckpoints = "Checkpoint Log"
	secNextMoves   = "Next Moves"
	secDecisions   = "Decisions"
	secRisks       = "Risks / Blockers"
	secResume      = "Resume"

	checkpointSep = " — " // em dash separates the stamp from the summary
)

// Scaffold returns a fresh, valid Doc skeleton. Updated is left empty for the
// caller (the CLI) to fill with an injected timestamp.
func Scaffold(title, mission string) Doc {
	if strings.TrimSpace(title) == "" {
		title = "PROGRESS"
	}
	return Doc{
		Title:   title,
		Status:  "in-progress",
		Mission: strings.TrimSpace(mission),
	}
}

// Render writes a Doc as canonical PROGRESS.md markdown. Render and Parse are
// inverses for canonical docs (Render(Parse(Render(d))) == Render(d)).
func Render(doc Doc) string {
	title := strings.TrimSpace(doc.Title)
	if title == "" {
		title = "PROGRESS"
	}

	header := fmt.Sprintf("# %s\n\nStatus: %s\nUpdated: %s\nBranch: %s",
		title, strings.TrimSpace(doc.Status), strings.TrimSpace(doc.Updated), strings.TrimSpace(doc.Branch))

	sections := []string{
		sectionBlock(secMission, strings.TrimSpace(doc.Mission)),
		sectionBlock(secMilestones, bulletBody(doc.Milestones)),
		sectionBlock(secCheckpoints, checkpointBody(doc.Checkpoints)),
		sectionBlock(secNextMoves, numberedBody(doc.NextMoves)),
		sectionBlock(secDecisions, bulletBody(doc.Decisions)),
		sectionBlock(secRisks, bulletBody(doc.Risks)),
		sectionBlock(secResume, bulletBody(doc.Resume)),
	}

	return header + "\n\n" + strings.Join(sections, "\n\n") + "\n"
}

// AppendCheckpoint inserts cp at the head of the Checkpoint Log and refreshes the
// front-block (Updated -> cp.Time, and Status -> status when status != ""). It is
// surgical: existing content and formatting are preserved, so a hand-maintained
// file keeps its shape. A file with no Checkpoint Log section is parsed and
// re-rendered canonically; empty input is scaffolded.
func AppendCheckpoint(md string, cp Checkpoint, status string) (string, error) {
	if strings.TrimSpace(md) == "" {
		doc := Scaffold("PROGRESS", "")
		doc.Updated = cp.Time
		if status != "" {
			doc.Status = status
		}
		doc.Checkpoints = []Checkpoint{cp}
		return Render(doc), nil
	}

	lines := strings.Split(md, "\n")

	// Refresh the front-block in place.
	for i, ln := range lines {
		if strings.HasPrefix(ln, "Updated:") {
			lines[i] = "Updated: " + cp.Time
		}
		if status != "" && strings.HasPrefix(ln, "Status:") {
			lines[i] = "Status: " + status
		}
	}

	// Locate the Checkpoint Log heading.
	headingIdx := -1
	for i, ln := range lines {
		if strings.TrimSpace(ln) == "## "+secCheckpoints {
			headingIdx = i
			break
		}
	}
	if headingIdx == -1 {
		// No log section: fall back to a structured parse + canonical re-render.
		doc, err := Parse(strings.Join(lines, "\n"))
		if err != nil {
			return "", err
		}
		doc.Updated = cp.Time
		if status != "" {
			doc.Status = status
		}
		doc.Checkpoints = append([]Checkpoint{cp}, doc.Checkpoints...)
		return Render(doc), nil
	}

	// Insert the new entry at the top of the log (most recent first): after the
	// heading and the one blank line that canonically follows it.
	insertAt := headingIdx + 1
	if insertAt < len(lines) && strings.TrimSpace(lines[insertAt]) == "" {
		insertAt++
	}
	entry := append(strings.Split(renderCheckpoint(cp), "\n"), "")

	out := make([]string, 0, len(lines)+len(entry))
	out = append(out, lines[:insertAt]...)
	out = append(out, entry...)
	out = append(out, lines[insertAt:]...)
	return strings.Join(out, "\n"), nil
}

// Parse reads a PROGRESS.md into a Doc. It is tolerant: it extracts the H1 title,
// the front-block (Status/Updated/Branch), and known H2 sections by heading,
// ignoring anything it does not recognize. A `## Status` section, if present, is
// used as a fallback for an absent front-block Status.
func Parse(md string) (Doc, error) {
	doc := Doc{}
	lines := strings.Split(md, "\n")

	section := ""    // current H2 (normalized) or "" for the preamble
	var buf []string // raw body lines for the current section
	var statusSection string

	flush := func() {
		body := buf
		buf = nil
		switch section {
		case "":
			// preamble: H1 + front-block key:value lines
			for _, ln := range body {
				if t := strings.TrimSpace(ln); strings.HasPrefix(t, "# ") {
					doc.Title = strings.TrimSpace(strings.TrimPrefix(t, "# "))
					continue
				}
				if k, v, ok := splitKeyValue(ln); ok {
					switch strings.ToLower(k) {
					case "status":
						doc.Status = v
					case "updated":
						doc.Updated = v
					case "branch":
						doc.Branch = v
					}
				}
			}
		case secMission:
			doc.Mission = strings.TrimSpace(strings.Join(body, "\n"))
		case "Status":
			statusSection = strings.TrimSpace(strings.Join(body, "\n"))
		case secMilestones:
			doc.Milestones = bulletItems(body)
		case secCheckpoints:
			doc.Checkpoints = parseCheckpoints(body)
		case secNextMoves:
			doc.NextMoves = bulletItems(body)
		case secDecisions:
			doc.Decisions = bulletItems(body)
		case secRisks:
			doc.Risks = bulletItems(body)
		case secResume:
			doc.Resume = bulletItems(body)
		}
	}

	for _, ln := range lines {
		if strings.HasPrefix(ln, "## ") {
			flush()
			section = strings.TrimSpace(strings.TrimPrefix(ln, "## "))
			continue
		}
		buf = append(buf, ln)
	}
	flush()

	if doc.Status == "" && statusSection != "" {
		doc.Status = firstLine(statusSection)
	}
	return doc, nil
}

// ResumeBrief renders a compact "where was I" view from a Doc plus live git
// context (the checked-out branch and whether the tree is dirty). It surfaces
// the front-block, the most recent checkpoint, the Next Moves, and the Resume
// pointers — the minimum needed to re-enter a long-horizon lane. It is pure:
// the caller supplies git state so the package stays free of process concerns.
func ResumeBrief(doc Doc, liveBranch string, dirty bool) string {
	var b strings.Builder

	title := strings.TrimSpace(doc.Title)
	if title == "" {
		title = "PROGRESS"
	}
	fmt.Fprintf(&b, "# Resume: %s\n\n", title)

	if s := strings.TrimSpace(doc.Status); s != "" {
		fmt.Fprintf(&b, "Status: %s\n", s)
	}
	if u := strings.TrimSpace(doc.Updated); u != "" {
		fmt.Fprintf(&b, "Updated: %s\n", u)
	}
	if strings.TrimSpace(doc.Branch) != "" || strings.TrimSpace(liveBranch) != "" {
		state := "clean"
		if dirty {
			state = "dirty"
		}
		fmt.Fprintf(&b, "Branch: file=%s live=%s (%s)\n", orDash(doc.Branch), orDash(liveBranch), state)
	}
	if fb, lb := strings.TrimSpace(doc.Branch), strings.TrimSpace(liveBranch); fb != "" && lb != "" && fb != lb {
		fmt.Fprintf(&b, "\n> Note: PROGRESS.md branch (%s) differs from the checked-out branch (%s).\n", fb, lb)
	}

	if len(doc.Checkpoints) > 0 {
		b.WriteString("\n## Latest Checkpoint\n\n")
		b.WriteString(renderCheckpoint(doc.Checkpoints[0]))
		b.WriteString("\n")
	}
	if len(doc.NextMoves) > 0 {
		b.WriteString("\n## Next Moves\n\n")
		b.WriteString(numberedBody(doc.NextMoves))
		b.WriteString("\n")
	}
	if len(doc.Resume) > 0 {
		b.WriteString("\n## Resume\n\n")
		b.WriteString(bulletBody(doc.Resume))
		b.WriteString("\n")
	}
	return b.String()
}

func orDash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "-"
	}
	return strings.TrimSpace(s)
}

// --- rendering helpers ---

func sectionBlock(title, body string) string {
	if body == "" {
		return "## " + title
	}
	return "## " + title + "\n\n" + body
}

func bulletBody(items []string) string {
	var lines []string
	for _, it := range items {
		if t := strings.TrimSpace(it); t != "" {
			lines = append(lines, "- "+t)
		}
	}
	return strings.Join(lines, "\n")
}

func numberedBody(items []string) string {
	var lines []string
	n := 0
	for _, it := range items {
		if t := strings.TrimSpace(it); t != "" {
			n++
			lines = append(lines, fmt.Sprintf("%d. %s", n, t))
		}
	}
	return strings.Join(lines, "\n")
}

func checkpointBody(cps []Checkpoint) string {
	var blocks []string
	for _, cp := range cps {
		blocks = append(blocks, renderCheckpoint(cp))
	}
	return strings.Join(blocks, "\n\n")
}

func renderCheckpoint(cp Checkpoint) string {
	var b strings.Builder
	fmt.Fprintf(&b, "### %s%s%s", strings.TrimSpace(cp.Time), checkpointSep, strings.TrimSpace(cp.Summary))
	for _, n := range cp.Notes {
		if t := strings.TrimSpace(n); t != "" {
			fmt.Fprintf(&b, "\n- %s", t)
		}
	}
	return b.String()
}

// --- parsing helpers ---

func parseCheckpoints(body []string) []Checkpoint {
	var out []Checkpoint
	var cur *Checkpoint
	for _, ln := range body {
		t := strings.TrimSpace(ln)
		if strings.HasPrefix(t, "### ") {
			if cur != nil {
				out = append(out, *cur)
			}
			head := strings.TrimSpace(strings.TrimPrefix(t, "### "))
			time, summary := splitCheckpointHead(head)
			cur = &Checkpoint{Time: time, Summary: summary}
			continue
		}
		if cur != nil {
			if item, ok := stripBullet(t); ok {
				cur.Notes = append(cur.Notes, item)
			}
		}
	}
	if cur != nil {
		out = append(out, *cur)
	}
	return out
}

// splitCheckpointHead separates "stamp — summary", tolerating an em dash (" — ")
// or a plain hyphen (" - ").
func splitCheckpointHead(head string) (stamp, summary string) {
	for _, sep := range []string{checkpointSep, " - "} {
		if i := strings.Index(head, sep); i >= 0 {
			return strings.TrimSpace(head[:i]), strings.TrimSpace(head[i+len(sep):])
		}
	}
	return strings.TrimSpace(head), ""
}

func bulletItems(body []string) []string {
	var out []string
	for _, ln := range body {
		if item, ok := stripBullet(strings.TrimSpace(ln)); ok {
			out = append(out, item)
		}
	}
	return out
}

// stripBullet removes a leading "- ", "* ", or "N. " marker. It reports false for
// lines that are not list items (blank lines, prose) so they are skipped.
func stripBullet(line string) (string, bool) {
	if line == "" {
		return "", false
	}
	if strings.HasPrefix(line, "- ") {
		return strings.TrimSpace(line[2:]), true
	}
	if strings.HasPrefix(line, "* ") {
		return strings.TrimSpace(line[2:]), true
	}
	// numbered "N. text"
	if i := strings.Index(line, ". "); i > 0 && isDigits(line[:i]) {
		return strings.TrimSpace(line[i+2:]), true
	}
	return "", false
}

func splitKeyValue(line string) (key, value string, ok bool) {
	i := strings.Index(line, ":")
	if i <= 0 {
		return "", "", false
	}
	key = strings.TrimSpace(line[:i])
	if strings.Contains(key, " ") { // a real "Key: value", not prose with a colon
		return "", "", false
	}
	return key, strings.TrimSpace(line[i+1:]), true
}

func isDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return strings.TrimSpace(s[:i])
	}
	return strings.TrimSpace(s)
}
