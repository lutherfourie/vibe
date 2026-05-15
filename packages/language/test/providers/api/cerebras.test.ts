import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createCerebrasProvider } from "../../../src/providers/api/cerebras.js";

describe("createCerebrasProvider", () => {
  it("returns a ProviderAdapter with the expected id and mode", () => {
    const provider = createCerebrasProvider({
      apiKey: "sk-fake",
      baseUrl: "https://example.invalid/v1",
      model: "zai-glm-4.7",
    });
    expect(provider.id).toBe("cerebras.zai-glm-4.7");
    expect(provider.mode).toBe("api");
  });

  it("accepts a custom id override", () => {
    const provider = createCerebrasProvider({
      apiKey: "sk-fake",
      baseUrl: "https://example.invalid/v1",
      model: "zai-glm-4.7",
      id: "cerebras.glm_4_7",
    });
    expect(provider.id).toBe("cerebras.glm_4_7");
  });

  it("throws when apiKey is missing", () => {
    expect(() =>
      createCerebrasProvider({
        apiKey: "",
        baseUrl: "https://example.invalid/v1",
        model: "zai-glm-4.7",
      }),
    ).toThrow(/api key/i);
  });

  // Note: a live generateObject test would hit Cerebras. SD2 ships a
  // recorded-fixture path - exercised in Task 17 - rather than mocking AI
  // SDK internals here. This file only covers the adapter's construction
  // contract.
});
