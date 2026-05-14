import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  buildUserPrompt,
} from "../../src/resolver/prompts.js";

describe("buildSystemPrompt", () => {
  it("mentions the canonical Vibe contract", () => {
    const prompt = buildSystemPrompt({ primitives: { agents: [], personas: [], providers: [], routes: [] } });
    expect(prompt.toLowerCase()).toContain("vibe");
    expect(prompt.toLowerCase()).toContain("structured");
  });

  it("includes declared primitives when supplied", () => {
    const prompt = buildSystemPrompt({
      primitives: { agents: ["izsha"], personas: ["coordinator"], providers: ["cerebras.glm_4_7"], routes: ["resolver"] },
    });
    expect(prompt).toContain("izsha");
    expect(prompt).toContain("coordinator");
    expect(prompt).toContain("cerebras.glm_4_7");
    expect(prompt).toContain("resolver");
  });
});

describe("buildUserPrompt", () => {
  it("wraps the prose with a clear delimiter", () => {
    const prompt = buildUserPrompt({ prose: "Make an agent named Izsha." });
    expect(prompt).toContain("Make an agent named Izsha.");
    // The delimiter shape is part of the contract so the LLM does not confuse
    // the prose with system instructions.
    expect(prompt).toMatch(/<prose>[\s\S]*<\/prose>/);
  });

  it("respects role hint when present", () => {
    const prompt = buildUserPrompt({ prose: "ok", role: "user" });
    expect(prompt.toLowerCase()).toContain("role: user");
  });
});
