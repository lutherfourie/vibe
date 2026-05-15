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
    expect(plan.lanes.map((lane) => lane.name)).toEqual([
      "research_lane",
      "language_lane",
      "runtime_spike_lane",
      "execution_surface_lane",
    ]);
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
      route resolver -> cerebras.glm_4_7
      memory vibe_project { kind = vault namespace = "C:/vibe" }
      plugin research_lane { impl = "./tools/research" owns = "docs/**" emits = "notes" }
      plugin human_gate { impl = "./tools/gate" owns = "review" emits = "approval" }
    `);

    const plan = extractSelfPlan(project);

    expect(plan.repo).toBe("C:/vibe");
    expect(plan.lanes).toHaveLength(1);
    expect(plan.lanes[0]).toMatchObject({
      name: "research_lane",
      owns: "docs/**",
    });
    expect(plan.gates).toHaveLength(1);
    expect(plan.gates[0]).toMatchObject({
      name: "human_gate",
      owns: "review",
    });
  });
});
