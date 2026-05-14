import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMockProvider } from "../../../src/providers/mock.js";
import { createProviderRegistry } from "../../../src/providers/index.js";
import { resolveProse } from "../../../src/resolver/index.js";

const FIXTURE_DIR = fileURLToPath(new URL("../../fixtures/recordings/", import.meta.url));

interface Recording {
  request: { messages: Array<{ role: "user" | "system" | "assistant"; content: string }>; temperature: number; model: string };
  response: unknown;
}

async function loadRecording(name: string): Promise<Recording> {
  const text = await readFile(`${FIXTURE_DIR}${name}.json`, "utf8");
  return JSON.parse(text) as Recording;
}

describe("Cerebras recorded fixture replay", () => {
  it("a recorded Cerebras response round-trips through resolveProse", async () => {
    const rec = await loadRecording("cerebras-hello");
    const provider = createMockProvider({
      id: "cerebras.glm_4_7",
      response: rec.response,
    });
    const registry = createProviderRegistry();
    registry.register(provider);

    const schema = z.object({ name: z.string(), description: z.string() });
    const result = await resolveProse({
      region: {
        kind: "prose",
        start: 0,
        end: rec.request.messages[1].content.length,
        text: "Make an agent named Izsha.",
        role: "user",
      },
      context: { provider: "cerebras.glm_4_7", model: rec.request.model, temperature: rec.request.temperature },
      schema,
      registry,
    });

    expect(result.value).toEqual(rec.response);
    expect(result.variance.model).toBe("zai-glm-4.7");
  });
});
