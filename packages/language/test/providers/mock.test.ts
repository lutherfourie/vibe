import { describe, expect, it } from "vitest";
import { createMockProvider } from "../../src/providers/mock.js";

describe("createMockProvider", () => {
  it("returns the configured response", async () => {
    const provider = createMockProvider({ response: { ok: true } });
    const result = await provider.generateObject({
      messages: [{ role: "user", content: "hi" }],
      schema: {},
    });
    expect(result.value).toEqual({ ok: true });
  });

  it("captures request history for assertion", async () => {
    const provider = createMockProvider({ response: { ok: true } });
    await provider.generateObject({
      messages: [{ role: "user", content: "ping" }],
      schema: {},
    });
    expect(provider.history).toHaveLength(1);
    expect(provider.history[0].messages[0].content).toBe("ping");
  });

  it("defaults to id mock.fixture and mode api", () => {
    const provider = createMockProvider({ response: 0 });
    expect(provider.id).toBe("mock.fixture");
    expect(provider.mode).toBe("api");
  });
});
