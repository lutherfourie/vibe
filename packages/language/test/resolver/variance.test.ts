import { describe, expect, it, vi } from "vitest";
import { formatVariance, makeVariance } from "../../src/resolver/variance.js";

describe("makeVariance", () => {
  it("builds a Variance with the current ISO timestamp", () => {
    const before = Date.now();
    const v = makeVariance({ provider: "cerebras.glm_4_7", model: "zai-glm-4.7", temperature: 0.3 });
    const after = Date.now();
    expect(v.provider).toBe("cerebras.glm_4_7");
    expect(v.model).toBe("zai-glm-4.7");
    expect(v.temperature).toBe(0.3);
    const atMs = Date.parse(v.at);
    expect(atMs).toBeGreaterThanOrEqual(before);
    expect(atMs).toBeLessThanOrEqual(after);
  });

  it("respects an injected `at`", () => {
    const v = makeVariance({ provider: "p", model: "m", temperature: 0, at: "2026-01-01T00:00:00Z" });
    expect(v.at).toBe("2026-01-01T00:00:00Z");
  });
});

describe("formatVariance", () => {
  it("renders the canonical one-line provenance string", () => {
    const v = { provider: "cerebras.glm_4_7", model: "zai-glm-4.7", temperature: 0.3, at: "2026-05-14T03:00:00Z" };
    expect(formatVariance(v)).toBe("resolver: cerebras.glm_4_7, model: zai-glm-4.7, t: 0.3, at: 2026-05-14T03:00:00Z");
  });
});
