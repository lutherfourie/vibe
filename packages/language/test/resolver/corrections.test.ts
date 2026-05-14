import { describe, expect, it } from "vitest";
import { mergeCorrected } from "../../src/resolver/corrections.js";

describe("mergeCorrected", () => {
  it("returns resolver value unchanged when no correction supplied", () => {
    const resolved = { name: "izsha", description: "coordinator, dry" };
    const merged = mergeCorrected({ resolved, corrected: undefined });
    expect(merged.value).toEqual(resolved);
    expect(merged.overrides).toEqual([]);
  });

  it("applies a corrected override to a single field", () => {
    const resolved = { name: "izsha", description: "coordinator, dry" };
    const corrected = { description: "human override" };
    const merged = mergeCorrected({ resolved, corrected });
    expect(merged.value).toEqual({ name: "izsha", description: "human override" });
    expect(merged.overrides).toEqual(["description"]);
  });

  it("applies multiple overrides", () => {
    const resolved = { a: 1, b: 2, c: 3 };
    const corrected = { a: 11, c: 33 };
    const merged = mergeCorrected({ resolved, corrected });
    expect(merged.value).toEqual({ a: 11, b: 2, c: 33 });
    expect(merged.overrides.sort()).toEqual(["a", "c"]);
  });

  it("preserves resolver fields not mentioned in corrected", () => {
    const resolved = { a: 1, b: 2 };
    const corrected = { a: 11 };
    const merged = mergeCorrected({ resolved, corrected });
    expect((merged.value as Record<string, unknown>).b).toBe(2);
  });

  it("ignores unknown corrected keys (logs but does not throw)", () => {
    const resolved = { a: 1 };
    const corrected = { b: 99 };
    const merged = mergeCorrected({ resolved, corrected });
    expect(merged.value).toEqual({ a: 1 });
    expect(merged.unknownKeys).toEqual(["b"]);
  });
});
