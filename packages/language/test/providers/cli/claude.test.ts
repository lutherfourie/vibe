import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createClaudeCliProvider } from "../../../src/providers/cli/claude.js";

describe("createClaudeCliProvider", () => {
  it("creates a ProviderAdapter with mode cli and the expected id", () => {
    const provider = createClaudeCliProvider({ binary: "claude" });
    expect(provider.mode).toBe("cli");
    expect(provider.id).toBe("anthropic.claude_code");
  });

  it("supports id override", () => {
    const provider = createClaudeCliProvider({ binary: "claude", id: "anthropic.custom" });
    expect(provider.id).toBe("anthropic.custom");
  });

  it("throws on missing binary path", () => {
    expect(() => createClaudeCliProvider({ binary: "" })).toThrow(/binary/i);
  });

  // Note: generateObject against a real `claude` binary is integration territory
  // and out of scope for unit tests. The base CLI driver covers the subprocess
  // protocol in Task 18 step 5 via a mock-binary script.
});
