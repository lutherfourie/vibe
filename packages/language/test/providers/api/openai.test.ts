import { describe, expect, it } from "vitest";
import {
  createOpenAIProvider,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_PROVIDER_ID,
} from "../../../src/providers/api/openai.js";

describe("createOpenAIProvider", () => {
  it("defaults to GPT-5.5 over the Responses API provider path", () => {
    const provider = createOpenAIProvider({ apiKey: "sk-fake" });

    expect(DEFAULT_OPENAI_MODEL).toBe("gpt-5.5");
    expect(provider.id).toBe(DEFAULT_OPENAI_PROVIDER_ID);
    expect(provider.mode).toBe("api");
  });

  it("derives a Vibe-safe id from custom OpenAI model slugs", () => {
    const provider = createOpenAIProvider({
      apiKey: "sk-fake",
      model: "gpt-5.5-2026-04-23",
    });

    expect(provider.id).toBe("openai.gpt_5_5_2026_04_23");
  });

  it("accepts a custom id override", () => {
    const provider = createOpenAIProvider({
      apiKey: "sk-fake",
      model: "gpt-5.5",
      id: "openai.frontier_reasoner",
    });

    expect(provider.id).toBe("openai.frontier_reasoner");
  });

  it("throws when apiKey is missing", () => {
    expect(() => createOpenAIProvider({ apiKey: "" })).toThrow(/api key/i);
  });
});
