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

    // crewPy must start with required import and contain Vibe IaC header link
    expect(result.crewPy.startsWith("from crewai import Agent, Task, Crew, Flow")).toBe(true);
    expect(result.crewPy).toContain("from crewai import Agent, Task, Crew, Flow");
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
  });
});
