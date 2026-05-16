package selfplan

import (
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
