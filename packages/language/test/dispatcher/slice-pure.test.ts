import { describe, expect, it } from "vitest";
import { slicePureStructured } from "../../src/dispatcher/slice-pure.js";

describe("slicePureStructured", () => {
  it("emits one structured region covering the whole source", () => {
    const text = "provider c.g { mode = api }\n";
    const regions = slicePureStructured(text);
    expect(regions).toHaveLength(1);
    expect(regions[0].kind).toBe("structured");
    expect(regions[0].start).toBe(0);
    expect(regions[0].end).toBe(text.length);
    expect(regions[0].text).toBe(text);
  });

  it("emits zero regions for empty input", () => {
    expect(slicePureStructured("")).toEqual([]);
  });

  it("preserves trailing newlines verbatim", () => {
    const text = "agent foo {}\n\n";
    const [region] = slicePureStructured(text);
    expect(region.text).toBe(text);
    expect(region.end).toBe(text.length);
  });
});
