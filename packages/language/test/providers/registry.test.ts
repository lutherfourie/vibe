import { describe, expect, it } from "vitest";
import { createMockProvider } from "../../src/providers/mock.js";
import { createProviderRegistry } from "../../src/providers/index.js";

describe("ProviderRegistry", () => {
  it("registers and looks up by id", () => {
    const registry = createProviderRegistry();
    const provider = createMockProvider({ id: "mock.a", response: {} });
    registry.register(provider);
    expect(registry.get("mock.a")).toBe(provider);
  });

  it("returns undefined for unknown ids", () => {
    const registry = createProviderRegistry();
    expect(registry.get("nope")).toBeUndefined();
  });

  it("rejects duplicate registration", () => {
    const registry = createProviderRegistry();
    registry.register(createMockProvider({ id: "mock.dup", response: 1 }));
    expect(() =>
      registry.register(createMockProvider({ id: "mock.dup", response: 2 })),
    ).toThrow(/already registered/i);
  });

  it("lists all registered ids", () => {
    const registry = createProviderRegistry();
    registry.register(createMockProvider({ id: "mock.a", response: {} }));
    registry.register(createMockProvider({ id: "mock.b", response: {} }));
    expect(registry.ids()).toEqual(["mock.a", "mock.b"]);
  });
});
