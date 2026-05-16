import { describe, expect, it } from "vitest";
import { laneTreeItemsFromSelfPlan } from "../src/vibe-lanes.js";

describe("Vibe lane tree", () => {
  it("creates compact tree items from self-plan lanes", () => {
    const items = laneTreeItemsFromSelfPlan({
      lanes: [
        {
          name: "vscode_agent_lane",
          target: "surface.vscode.agent_admin",
          reads: ["AGENTS.md", "CLAUDE.md"],
          owns: "AGENTS.md CLAUDE.md .vscode/** packages/vscode-extension/**",
          verify: ["pnpm --filter vibe-vscode test", "pnpm run check"],
          approval: "human.before_commit",
          emits: "VS Code command palette and Codex/Claude extension administration loop",
        },
      ],
    });

    expect(items).toEqual([
      {
        id: "vscode_agent_lane",
        label: "vscode_agent_lane",
        description: "surface.vscode.agent_admin",
        detail: "VS Code command palette and Codex/Claude extension administration loop",
        target: "surface.vscode.agent_admin",
        reads: ["AGENTS.md", "CLAUDE.md"],
        owns: "AGENTS.md CLAUDE.md .vscode/** packages/vscode-extension/**",
        verify: ["pnpm --filter vibe-vscode test", "pnpm run check"],
        approval: "human.before_commit",
      },
    ]);
  });
});
