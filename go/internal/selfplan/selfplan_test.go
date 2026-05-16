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
