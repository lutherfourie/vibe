package selfplan

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseReadsLaneTargetsAndVerification(t *testing.T) {
	plan, err := Parse([]byte(`{
	  "name": "vibe-self",
	  "repo": "C:/vibe",
	  "lanes": [
	    {
	      "name": "vscode_agent_lane",
	      "target": "surface.vscode.agent_admin",
	      "reads": ["AGENTS.md"],
	      "owns": "AGENTS.md CLAUDE.md .vscode/**",
	      "verify": ["pnpm --filter vibe-vscode test"],
	      "approval": "human.before_commit",
	      "emits": "VS Code command palette and Codex/Claude extension administration loop"
	    }
	  ]
	}`))
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}

	lane := plan.Lanes[0]
	if lane.Name != "vscode_agent_lane" {
		t.Fatalf("unexpected lane name: %s", lane.Name)
	}
	if lane.Target != "surface.vscode.agent_admin" {
		t.Fatalf("unexpected target: %s", lane.Target)
	}
	if len(lane.Verify) != 1 || lane.Verify[0] != "pnpm --filter vibe-vscode test" {
		t.Fatalf("unexpected verify commands: %#v", lane.Verify)
	}
}

func TestMermaidIncludesLaneAndTargetSurface(t *testing.T) {
	plan := Plan{
		Name: "vibe-self",
		Lanes: []Lane{
			{
				Name:   "vscode_agent_lane",
				Target: "surface.vscode.agent_admin",
				Owns:   "AGENTS.md CLAUDE.md .vscode/**",
				Verify: []string{"pnpm --filter vibe-vscode test"},
			},
		},
	}

	graph := Mermaid(plan)
	for _, want := range []string{
		"flowchart LR",
		`lane_vscode_agent_lane["vscode_agent_lane"]`,
		`surface_vscode_agent_admin["surface.vscode.agent_admin"]`,
		"lane_vscode_agent_lane --> surface_vscode_agent_admin",
		`lane_vscode_agent_lane -. verifies .-> verify_vscode_agent_lane["pnpm --filter vibe-vscode test"]`,
	} {
		if !strings.Contains(graph, want) {
			t.Fatalf("graph missing %q:\n%s", want, graph)
		}
	}
}

func TestDashboardIncludesVisualGraphAndCopyableHandoff(t *testing.T) {
	plan := Plan{
		Name:   "vibe-self",
		Source: "examples/vibe-self.vibe",
		Repo:   "C:/vibe",
		Lanes: []Lane{
			{
				Name:     "local_toolkit_lane",
				Target:   "surface.codex.local",
				Reads:    []string{"README.md", "examples/vibe-self.vibe"},
				Owns:     "docs/local-toolkit.md go/** packages/**",
				Verify:   []string{"pnpm run self:plan", "pnpm test"},
				Approval: "human.before_commit",
				Emits:    "small vibe CLI plan",
			},
		},
	}

	html := DashboardHTML(plan, Mermaid(plan))
	for _, want := range []string{
		"<h2>Lane Graph</h2>",
		"class=\"graph-row\"",
		"data-copy-target=\"handoff-local_toolkit_lane\"",
		"href=\"/handoffs/local_toolkit_lane.md\"",
		"download",
		"# Vibe Lane Handoff: local_toolkit_lane",
		"Write scope: docs/local-toolkit.md go/** packages/**",
		"- pnpm run self:plan",
		"<summary>Mermaid source</summary>",
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("dashboard missing %q:\n%s", want, html)
		}
	}
}

func TestWriteLaneHandoffsExportsMarkdownFiles(t *testing.T) {
	dir := t.TempDir()
	plan := Plan{
		Name:   "vibe-self",
		Source: "examples/vibe-self.vibe",
		Repo:   "C:/vibe",
		Lanes: []Lane{
			{
				Name:     "local_toolkit_lane",
				Target:   "surface.codex.local",
				Owns:     "docs/local-toolkit.md go/** packages/**",
				Verify:   []string{"pnpm run self:plan", "pnpm test"},
				Approval: "human.before_commit",
			},
		},
	}

	exports, err := WriteLaneHandoffs(plan, dir)
	if err != nil {
		t.Fatalf("WriteLaneHandoffs returned error: %v", err)
	}
	if len(exports) != 1 {
		t.Fatalf("expected 1 export, got %d", len(exports))
	}

	wantPath := filepath.Join(dir, "local_toolkit_lane.md")
	if exports[0].LaneName != "local_toolkit_lane" || exports[0].Path != wantPath {
		t.Fatalf("unexpected export metadata: %#v", exports[0])
	}

	raw, err := os.ReadFile(wantPath)
	if err != nil {
		t.Fatalf("read exported handoff: %v", err)
	}
	for _, want := range []string{
		"# Vibe Lane Handoff: local_toolkit_lane",
		"Target surface: surface.codex.local",
		"Write scope: docs/local-toolkit.md go/** packages/**",
		"- pnpm run self:plan",
	} {
		if !strings.Contains(string(raw), want) {
			t.Fatalf("exported handoff missing %q:\n%s", want, string(raw))
		}
	}
}

func TestLoadRejectsInvalidSelfPlan(t *testing.T) {
	// Valid JSON, but missing the schema-required top-level fields. Parse alone
	// would accept this (it only requires name); Load must reject it via the
	// canonical schema contract.
	path := filepath.Join(t.TempDir(), "bad-self-plan.json")
	if err := os.WriteFile(path, []byte(`{"name":"vibe-self","lanes":[]}`), 0o644); err != nil {
		t.Fatalf("write bad self-plan: %v", err)
	}
	_, err := Load(path)
	if err == nil {
		t.Fatal("expected Load to reject a self-plan that violates the schema")
	}
	if !strings.Contains(err.Error(), "vibe-self-plan.schema.json") {
		t.Fatalf("error should name the self-plan schema: %v", err)
	}
}

func TestLoadAcceptsCommittedSelfPlan(t *testing.T) {
	// The committed self-plan is the canonical fixture and must satisfy the
	// schema Load now enforces.
	path := filepath.Join("..", "..", "..", "docs", "examples", "vibe-self-plan.json")
	plan, err := Load(path)
	if err != nil {
		t.Fatalf("Load rejected the committed self-plan: %v", err)
	}
	if plan.Name == "" {
		t.Fatalf("expected a named plan, got %#v", plan)
	}
}

func TestLaneHandoffUsesFallbacksForSparseLanes(t *testing.T) {
	handoff := LaneHandoff(Plan{Name: "vibe-self"}, Lane{Name: "research_lane"})
	for _, want := range []string{
		"Repo: C:/vibe",
		"Self-plan source: examples/vibe-self.vibe",
		"Target surface: not declared",
		"Write scope: not declared",
		"Approval: not declared",
	} {
		if !strings.Contains(handoff, want) {
			t.Fatalf("handoff missing %q:\n%s", want, handoff)
		}
	}
}
