import { describe, expect, it } from "vitest";
import { computeCacheKey, createInMemoryCache } from "../../src/resolver/cache.js";
import type { ResolverResult } from "../../src/resolver/types.js";

const sampleResult: ResolverResult<{ x: number }> = {
  value: { x: 1 },
  variance: { provider: "cerebras.glm_4_7", model: "zai-glm-4.7", temperature: 0.3, at: "2026-05-14T00:00:00Z" },
  cached: false,
  cacheKey: "ignored",
};

describe("computeCacheKey", () => {
  it("produces a stable hex string for the same inputs", () => {
    const a = computeCacheKey("hello", "zai-glm-4.7", 0.3);
    const b = computeCacheKey("hello", "zai-glm-4.7", 0.3);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when content changes", () => {
    const a = computeCacheKey("hello", "zai-glm-4.7", 0.3);
    const b = computeCacheKey("hello world", "zai-glm-4.7", 0.3);
    expect(a).not.toBe(b);
  });

  it("changes when model changes", () => {
    const a = computeCacheKey("hello", "zai-glm-4.7", 0.3);
    const b = computeCacheKey("hello", "claude-4.7", 0.3);
    expect(a).not.toBe(b);
  });

  it("changes when temperature changes", () => {
    const a = computeCacheKey("hello", "zai-glm-4.7", 0.3);
    const b = computeCacheKey("hello", "zai-glm-4.7", 0.7);
    expect(a).not.toBe(b);
  });
});

describe("createInMemoryCache", () => {
  it("get returns undefined for unknown keys", () => {
    const cache = createInMemoryCache();
    expect(cache.get("nope")).toBeUndefined();
  });

  it("get returns the set value", () => {
    const cache = createInMemoryCache();
    cache.set("k1", sampleResult);
    expect(cache.get("k1")).toEqual(sampleResult);
  });

  it("size grows with each unique set", () => {
    const cache = createInMemoryCache();
    cache.set("k1", sampleResult);
    cache.set("k2", sampleResult);
    expect(cache.size()).toBe(2);
  });
});
