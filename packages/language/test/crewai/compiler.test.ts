import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileCrewAIFromSource } from "../../src/crewai/compiler.js";

describe("CrewAI compiler (P1)", () => {
  it("compiles examples/08-agent.vibe + crewai.local surface/lane into valid artifacts", async () => {
    const basePath = resolve(import.meta.dirname, "../../../../examples/08-agent.vibe");
    const base = readFileSync(basePath, "utf8");

    // Append minimal surface + lane (with human gate) per acceptance
    const extra = `
surface crewai.local { kind = framework mode = python }
plugin demo_lane { target = surface.crewai.local approval = human.before_runtime }
`;
    const source = base + "\n" + extra;

    const result = await compileCrewAIFromSource(source);

    // crewPy must start with required import and contain Vibe IaC header link.
    // BUG-1 fix: `Flow` is NOT importable from the crewai root — it lives at
    // `crewai.flow.flow`. The root import must be clean.
    expect(result.crewPy.startsWith("from crewai import Agent, Task, Crew\n")).toBe(true);
    expect(result.crewPy).toContain("from crewai import Agent, Task, Crew\n");
    expect(result.crewPy).not.toContain("from crewai import Agent, Task, Crew, Flow");
    expect(result.crewPy).toContain("Agent(");
    expect(result.crewPy).toContain("role=");
    expect(result.crewPy).toContain("goal=");
    expect(result.crewPy).toContain("VIBE-CREWAI-BUILD-PROGRESS.md");

    // Human gate produces human_feedback and VIBE_GATE comment
    const combined = result.crewPy + "\n" + (result.flowPy ?? "") + "\n" + (result.vibeContractMd ?? "");
    expect(combined).toContain("human_feedback");
    expect(combined).toContain("VIBE_GATE");

    // Manifest roundtrips key info (deterministic, personas from izsha_voice, lane >=1)
    const m = result.manifest;
    expect(Array.isArray(m.personas)).toBe(true);
    expect(m.personas).toContain("izsha_voice"); // the izsha persona name
    expect(typeof m.laneCount).toBe("number");
    expect(m.laneCount as number).toBeGreaterThanOrEqual(1);

    // Basic presence of structure
    expect(result.vibeContractMd).toContain("VIBE-CREWAI-BUILD-PROGRESS.md");
    expect(result.diagnostics).toBeInstanceOf(Array);

    // BUG-3 fix: Flow steps must chain @listen to the PREVIOUS lane's method,
    // not an invented `_done` symbol (which never exists, so flows never fire
    // past step 1). The flow uses the proper crewai.flow import + @start/@listen.
    if (result.flowPy) {
      expect(result.flowPy).toContain("from crewai.flow.flow import Flow, start, listen");
      expect(result.flowPy).toContain("@start()");
      // No invented `_done` symbol anywhere in the chaining.
      expect(result.flowPy).not.toContain("_done");
    }
  });

  it("chains @listen to the previous lane's method so multi-lane flows fire past step 1 (BUG-3)", async () => {
    const basePath = resolve(import.meta.dirname, "../../../../examples/08-agent.vibe");
    const base = readFileSync(basePath, "utf8");

    // Two lanes → first @start(), second must @listen the FIRST lane's method.
    const extra = `
surface crewai.local { kind = framework mode = python }
plugin first_lane  { target = surface.crewai.local }
plugin second_lane { target = surface.crewai.local }
`;
    const source = base + "\n" + extra;

    const result = await compileCrewAIFromSource(source);
    expect(result.flowPy).toBeDefined();
    const flow = result.flowPy!;

    // Lane 1 starts the flow; Lane 2 listens to Lane 1's method (not `_done`).
    expect(flow).toContain("@start()");
    expect(flow).toContain("def first_lane(self):");
    expect(flow).toContain("@listen(first_lane)");
    expect(flow).toContain("def second_lane(self, _prev):");
    expect(flow).not.toContain("_done");
  });
});
