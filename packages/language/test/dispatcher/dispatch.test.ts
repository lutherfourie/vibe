import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dispatchSource } from "../../src/dispatcher/index.js";

const FIXTURE_DIR = fileURLToPath(new URL("../fixtures/shapes/", import.meta.url));

async function fixture(name: string): Promise<string> {
  return readFile(`${FIXTURE_DIR}${name}`, "utf8");
}

describe("dispatchSource", () => {
  it("classifies + slices pure-structured source", async () => {
    const text = await fixture("pure.vibe");
    const stream = dispatchSource(text);
    expect(stream.shape).toBe("pure-structured");
    expect(stream.regions).toHaveLength(1);
    expect(stream.regions[0].kind).toBe("structured");
  });

  it("classifies + slices markdown source", async () => {
    const text = await fixture("markdown.vibe");
    const stream = dispatchSource(text);
    expect(stream.shape).toBe("markdown");
    const kinds = stream.regions.map((r) => r.kind);
    expect(kinds).toContain("structured");
    expect(kinds).toContain("prose");
  });

  it("classifies + slices conversation source", async () => {
    const text = await fixture("conversation.vibe");
    const stream = dispatchSource(text);
    expect(stream.shape).toBe("conversation");
    const proseRoles = stream.regions
      .filter((r) => r.kind === "prose")
      .map((r) => r.kind === "prose" ? r.role : null);
    expect(proseRoles).toContain("user");
    expect(proseRoles).toContain("assistant");
  });

  it("emits zero regions for empty input", () => {
    const stream = dispatchSource("");
    expect(stream.shape).toBe("pure-structured");
    expect(stream.regions).toEqual([]);
  });
});
