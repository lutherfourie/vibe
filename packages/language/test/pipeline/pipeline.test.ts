import { describe, expect, it } from "vitest";
import { createProviderRegistry } from "../../src/providers/index.js";
import { runPipeline } from "../../src/pipeline/run.js";

describe("runPipeline — pure structured source", () => {
  it("parses pure-structured input with no resolver call", async () => {
    const registry = createProviderRegistry();
    const result = await runPipeline({
      source: `
        provider cerebras.glm_4_7 { mode = api }
        route resolver -> cerebras.glm_4_7
        persona izsha { description = "coordinator, dry" }
      `,
      registry,
      defaultResolver: { provider: "unused", model: "unused", temperature: 0 },
    });
    expect(result.shape).toBe("pure-structured");
    expect(result.parseErrors).toEqual([]);
    expect(result.resolvedRegions).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });
});
