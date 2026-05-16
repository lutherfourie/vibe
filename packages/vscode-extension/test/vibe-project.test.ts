import { describe, expect, it } from "vitest";
import { extractSelfPlanFromSource } from "@vibe/language";
import {
  agentsPreviewMarkdown,
  gamespreeProjectTemplate,
  gamespreeState,
  genericProjectTemplate,
  projectTreeItemsFromSelfPlan,
} from "../src/vibe-project.js";

describe("Vibe Now project cockpit", () => {
  it("builds the first-level Vibe sidebar sections", () => {
    const tree = projectTreeItemsFromSelfPlan({
      name: "GameSpree",
      source: ".vibe/project.vibe",
      repo: "C:/GameSpree",
      routes: {
        implementation: "openai.codex",
        reviewer: "anthropic.claude_code",
      },
      agents: [{ name: "gamespree_operator", uses: ["plugin.pawfall_feel_lane"] }],
      lanes: [{ name: "pawfall_feel_lane", owns: "cat-cafe/games/pawfall/src/**" }],
      gates: [{ name: "human_merge_gate", emits: "approved merge decision" }],
      notes: ["real lane syntax is still future work"],
    });

    expect(tree.map((item) => item.label)).toEqual([
      "Project",
      "Agents",
      "Routes",
      "Lanes",
      "Gates",
      "Plugins",
      "Memory",
      "Problems",
    ]);
    expect(tree.find((item) => item.label === "Lanes")?.children?.[0]).toMatchObject({
      label: "pawfall_feel_lane",
      description: "cat-cafe/games/pawfall/src/**",
    });
  });

  it("creates an opinionated GameSpree/Pawfall starter state", () => {
    const state = gamespreeState("C:/GameSpree");

    expect(state.routes).toMatchObject({
      resolver: "openai.gpt_5_5",
      implementation: "openai.codex",
      reviewer: "anthropic.claude_code",
    });
    expect(state.fallback).toBe("openai.gpt_5_5");
    expect(state.lanes?.map((lane) => lane.name)).toContain("pawfall_feel_lane");
    expect(state.gates?.map((gate) => gate.name)).toContain("webgl_smoke");
    expect(gamespreeProjectTemplate()).toContain("agent gamespree_operator");
  });

  it("keeps the GameSpree/Pawfall starter template parseable", async () => {
    const plan = await extractSelfPlanFromSource(gamespreeProjectTemplate(), {
      name: "GameSpree",
      sourceName: ".vibe/project.vibe",
    });

    expect(plan.name).toBe("GameSpree");
    expect(plan.routes.resolver).toBe("openai.gpt_5_5");
    expect(plan.routes.reviewer).toBe("anthropic.claude_code");
    expect(plan.lanes.map((lane) => lane.name)).toContain("pawfall_feel_lane");
  });

  it("renders an AGENTS preview from the visible state", () => {
    const preview = agentsPreviewMarkdown(gamespreeState("C:/GameSpree"));

    expect(preview).toContain("# GameSpree Agent Contract Preview");
    expect(preview).toContain("### pawfall_feel_lane");
    expect(preview).toContain("- reviewer: anthropic.claude_code");
  });

  it("creates a generic project template using a safe Vibe identifier", () => {
    expect(genericProjectTemplate("New Project")).toContain("agent new_project_operator");
  });
});
