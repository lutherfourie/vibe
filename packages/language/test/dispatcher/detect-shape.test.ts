import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectShape } from "../../src/dispatcher/detect-shape.js";

const FIXTURE_DIR = fileURLToPath(new URL("../fixtures/shapes/", import.meta.url));

async function fixture(name: string): Promise<string> {
  return readFile(`${FIXTURE_DIR}${name}`, "utf8");
}

describe("detectShape", () => {
  it("identifies pure-structured source", async () => {
    const text = await fixture("pure.vibe");
    expect(detectShape(text)).toBe("pure-structured");
  });

  it("identifies markdown source by leading heading + fenced vibe block", async () => {
    const text = await fixture("markdown.vibe");
    expect(detectShape(text)).toBe("markdown");
  });

  it("identifies conversation source by role tag at line start", async () => {
    const text = await fixture("conversation.vibe");
    expect(detectShape(text)).toBe("conversation");
  });

  it("falls back to pure-structured for empty input", () => {
    expect(detectShape("")).toBe("pure-structured");
  });

  it("falls back to pure-structured when no leading prose marker is present", () => {
    expect(detectShape("// a comment\nprovider c.g { mode = api }")).toBe("pure-structured");
  });
});
