import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractSelfPlan,
  extractSelfPlanFromSource,
} from "../../src/self/self-plan.js";
import { expectParses } from "../parse-helper.js";

describe("Vibe self-plan extraction", () => {
  it("extracts provisional lanes and gates from examples/vibe-self.vibe", async () => {
    const sourcePath = resolve(import.meta.dirname, "../../../../examples/vibe-self.vibe");
    const source = await readFile(sourcePath, "utf8");

    const plan = await extractSelfPlanFromSource(source, {
      sourceName: "examples/vibe-self.vibe",
      uri: `file:///${sourcePath.replaceAll("\\", "/")}`,
    });

    expect(plan.name).toBe("vibe-self");
    expect(plan.repo).toBe("C:/vibe");
    expect(plan.routes).toMatchObject({
      resolver: "cerebras.glm_4_7",
      researcher: "cerebras.glm_4_7",
      implementation: "openai.codex",
    });
    expect(plan.fallback).toBe("cerebras.glm_4_7");
    expect(plan.surfaces.map((surface) => surface.name)).toEqual([
      "codex.local",
      "codex.cli",
      "codex.cloud",
      "codex.github_pr",
      "vscode.agent_admin",
    ]);
    expect(plan.surfaces[0]).toMatchObject({
      name: "codex.local",
      kind: "codex",
      mode: "local",
      metadata: {
        guidance: "AGENTS.md",
        skills: "./.agents/skills",
      },
    });
    expect(plan.lanes.map((lane) => lane.name)).toEqual([
      "research_lane",
      "language_lane",
      "runtime_spike_lane",
      "execution_surface_lane",
      "bootstrap_tooling_lane",
      "local_toolkit_lane",
      "vscode_agent_lane",
    ]);
    expect(plan.lanes.find((lane) => lane.name === "local_toolkit_lane")).toMatchObject({
      target: "surface.codex.local",
      reads: [
        "README.md",
        "docs/fresh-start.md",
        "examples/vibe-self.vibe",
      ],
      verify: [
        "pnpm run self:plan",
        "pnpm test",
        "pnpm run build",
      ],
      approval: "human.before_commit",
    });
    expect(plan.lanes.find((lane) => lane.name === "vscode_agent_lane")).toMatchObject({
      target: "surface.vscode.agent_admin",
      reads: [
        "AGENTS.md",
        "CLAUDE.md",
        ".vscode/tasks.json",
        "packages/vscode-extension/src/extension.ts",
      ],
      verify: [
        "pnpm --filter vibe-vscode test",
        "pnpm --filter vibe-vscode build",
        "pnpm run check",
      ],
      approval: "human.before_commit",
    });
    expect(plan.gates.map((gate) => gate.name)).toEqual([
      "human_merge_gate",
    ]);
    expect(plan.agents[0]).toMatchObject({
      name: "vibe_bootstrap",
      persona: "persona.vibe_bootstrap_voice",
      memory: "memory.vibe_project",
      harness: "harness.self_making",
    });
  });

  it("can extract from an already parsed project", async () => {
    const project = await expectParses(`
      provider cerebras.glm_4_7 { mode = api }
      surface codex.local { kind = codex mode = local guidance = "AGENTS.md" }
      route resolver -> cerebras.glm_4_7
      memory vibe_project { kind = vault namespace = "C:/vibe" }
      plugin research_lane { impl = "./tools/research" owns = "docs/**" emits = "notes" target = surface.codex.local verify = ["pnpm test"] }
      plugin human_gate { impl = "./tools/gate" owns = "review" emits = "approval" }
    `);

    const plan = extractSelfPlan(project);

    expect(plan.repo).toBe("C:/vibe");
    expect(plan.surfaces).toEqual([
      {
        name: "codex.local",
        kind: "codex",
        mode: "local",
        metadata: {
          kind: "codex",
          mode: "local",
          guidance: "AGENTS.md",
        },
      },
    ]);
    expect(plan.lanes).toHaveLength(1);
    expect(plan.lanes[0]).toMatchObject({
      name: "research_lane",
      owns: "docs/**",
      target: "surface.codex.local",
      verify: ["pnpm test"],
    });
    expect(plan.gates).toHaveLength(1);
    expect(plan.gates[0]).toMatchObject({
      name: "human_gate",
      owns: "review",
    });
  });

  it("allows callers to name non-self project snapshots", async () => {
    const source = `
provider openai.codex { mode = cli }
route resolver -> openai.codex
route implementation -> openai.codex
memory gamespree_project {
  kind = vault
  namespace = "C:/GameSpree"
}
`;

    const plan = await extractSelfPlanFromSource(source, {
      name: "GameSpree",
      sourceName: ".vibe/project.vibe",
    });

    expect(plan.name).toBe("GameSpree");
    expect(plan.source).toBe(".vibe/project.vibe");
  });
});
