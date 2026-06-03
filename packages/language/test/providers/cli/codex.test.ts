import { describe, expect, it } from "vitest";
import { createCodexCliProvider } from "../../../src/providers/cli/codex.js";

describe("createCodexCliProvider", () => {
  it("creates a ProviderAdapter with mode cli and the expected id", () => {
    const provider = createCodexCliProvider({ binary: "codex" });
    expect(provider.mode).toBe("cli");
    expect(provider.id).toBe("openai.codex");
  });

  it("supports id override", () => {
    const provider = createCodexCliProvider({ binary: "codex", id: "openai.custom_codex" });
    expect(provider.id).toBe("openai.custom_codex");
  });

  it("throws on missing binary path", () => {
    expect(() => createCodexCliProvider({ binary: "" })).toThrow(/binary/i);
  });
});
