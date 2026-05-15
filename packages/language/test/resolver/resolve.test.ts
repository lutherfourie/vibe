import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ProseRegion } from "../../src/dispatcher/types.js";
import { createMockProvider } from "../../src/providers/mock.js";
import { createProviderRegistry } from "../../src/providers/index.js";
import { resolveProse } from "../../src/resolver/index.js";

const proseRegion: ProseRegion = {
  kind: "prose",
  start: 0,
  end: 32,
  text: "Make an agent named Izsha.",
  role: "user",
};

const schema = z.object({ name: z.string(), description: z.string() });

describe("resolveProse — happy path", () => {
  it("returns the provider's output, wrapped with variance", async () => {
    const provider = createMockProvider({
      id: "mock.api",
      response: { name: "izsha", description: "coordinator, dry" },
    });
    const registry = createProviderRegistry();
    registry.register(provider);

    const result = await resolveProse({
      region: proseRegion,
      context: {
        provider: "mock.api",
        model: "mock-model",
        temperature: 0.3,
        primitives: { agents: [], personas: [], providers: [], routes: [] },
      },
      schema,
      registry,
    });

    expect(result.value).toEqual({ name: "izsha", description: "coordinator, dry" });
    expect(result.variance.provider).toBe("mock.api");
    expect(result.variance.model).toBe("mock-model");
    expect(result.variance.temperature).toBe(0.3);
    expect(typeof result.variance.at).toBe("string");
    expect(result.cached).toBe(false);
  });

  it("hits the cache on the second call with the same inputs", async () => {
    const provider = createMockProvider({ id: "mock.api2", response: { name: "x", description: "y" } });
    const registry = createProviderRegistry();
    registry.register(provider);
    const cache = (await import("../../src/resolver/cache.js")).createInMemoryCache();

    const ctx = {
      provider: "mock.api2",
      model: "mock-model",
      temperature: 0.3,
      cache,
      primitives: { agents: [], personas: [], providers: [], routes: [] },
    };

    const first = await resolveProse({ region: proseRegion, context: ctx, schema, registry });
    const second = await resolveProse({ region: proseRegion, context: ctx, schema, registry });
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(provider.history).toHaveLength(1); // only the first call hit the provider
  });

  it("throws when the provider id is not registered", async () => {
    const registry = createProviderRegistry();
    await expect(
      resolveProse({
        region: proseRegion,
        context: { provider: "missing", model: "m", temperature: 0.3 },
        schema,
        registry,
      }),
    ).rejects.toThrow(/missing/);
  });

  it("propagates schema validation failures from the provider", async () => {
    const provider = createMockProvider({ id: "mock.bad", response: { wrong: true } });
    const registry = createProviderRegistry();
    registry.register(provider);
    await expect(
      resolveProse({
        region: proseRegion,
        context: { provider: "mock.bad", model: "m", temperature: 0.3 },
        schema,
        registry,
      }),
    ).rejects.toThrow();
  });
});
