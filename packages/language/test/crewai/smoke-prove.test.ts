// P4 static end-to-end prove test.
// Compiles examples/crewai-smoke.vibe and asserts the generated CrewAI artifacts are valid.
// STATIC ONLY — no LLM, no crew execution, no crewai package install.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileCrewAIFromSource } from "../../src/crewai/compiler.js";

describe("CrewAI smoke prove (P4)", () => {
  it("compiles examples/crewai-smoke.vibe to valid static CrewAI artifacts", async () => {
    const srcPath = resolve(import.meta.dirname, "../../../../examples/crewai-smoke.vibe");
    const source = readFileSync(srcPath, "utf8");

    const result = await compileCrewAIFromSource(source);

    // crewPy contract
    expect(result.crewPy.startsWith("from crewai import Agent, Task, Crew\n")).toBe(true);
    expect(result.crewPy).not.toContain("from crewai import Agent, Task, Crew, Flow");

    // Agent mapping from persona
    expect(result.crewPy).toContain("Agent(");
    expect(result.crewPy).toContain("role=");
    expect(result.crewPy).toContain("goal=");
    expect(result.crewPy).toContain("backstory=");

    // P5: Task human_input for gated (from approval on smoke lane)
    expect(result.crewPy).toContain("human_input=True");

    // Vibe IaC header / contract link
    expect(result.crewPy).toContain("VIBE-CREWAI-BUILD-PROGRESS.md");
    expect(result.vibeContractMd).toContain("VIBE-CREWAI-BUILD-PROGRESS.md");

    // Human gate markers (approval=human.before_runtime on the _lane plugin) + VIBE_GATE kept
    const combined = [result.crewPy, result.flowPy ?? "", result.vibeContractMd ?? ""].join("\n");
    expect(combined).toContain("human_feedback");
    expect(combined).toContain("VIBE_GATE");

    // P5 manifest crewai pin + requirements
    expect(result.manifest.crewai).toBeDefined();
    // @ts-expect-error loose
    expect((result.manifest.crewai as any).pinned).toContain("1.14.7");
    expect(result.requirements).toBeDefined();
    expect(result.requirements).toContain("crewai==1.14.7");

    // Flow (emitted because we have lanes via _lane plugin + autonomous session)
    if (result.flowPy) {
      expect(result.flowPy).toContain("from crewai.flow.flow import Flow, start, listen");
      // P5 real HITL: must import the decorator from the human_feedback module (no undefined symbol)
      expect(result.flowPy).toContain("from crewai.flow.human_feedback import human_feedback");
      expect(result.flowPy).toContain("@human_feedback");
      expect(result.flowPy).toContain("@start()");
      expect(result.flowPy).not.toContain("_done");
      expect(result.flowPy).not.toContain("def human_feedback()");
    }

    // Checkpoint marker injected for lanes/autonomous
    expect(combined).toContain("VIBE_CHECKPOINT");

    // Manifest: personas include our smoke persona, laneCount >=1
    const m = result.manifest;
    expect(Array.isArray(m.personas)).toBe(true);
    expect(m.personas).toContain("smoke_voice");
    expect(typeof m.laneCount).toBe("number");
    expect(m.laneCount as number).toBeGreaterThanOrEqual(1);

    expect(result.diagnostics).toBeInstanceOf(Array);
  });
});
