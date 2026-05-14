import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMockProvider } from "../../src/providers/mock.js";
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

describe("runPipeline — markdown with prose", () => {
  it("dispatches structured to parser and prose to resolver", async () => {
    const provider = createMockProvider({
      id: "mock.api",
      response: { description: "coordinator, dry" },
    });
    const registry = createProviderRegistry();
    registry.register(provider);

    const result = await runPipeline({
      source: `# Izsha

We want a coordinator agent named Izsha.

\`\`\`vibe
provider cerebras.glm_4_7 { mode = api }
route resolver -> cerebras.glm_4_7
persona izsha { description = "placeholder" }
\`\`\`

She should sound terse.
`,
      registry,
      defaultResolver: { provider: "mock.api", model: "mock-m", temperature: 0.3 },
      proseSchema: z.object({ description: z.string() }),
    });

    expect(result.shape).toBe("markdown");
    expect(result.parseErrors).toEqual([]);
    expect(result.resolvedRegions.length).toBeGreaterThanOrEqual(1);
    expect(result.resolvedRegions[0].value).toEqual({ description: "coordinator, dry" });
  });
});
