import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sliceMarkdown } from "../../src/dispatcher/slice-markdown.js";

const FIXTURE_DIR = fileURLToPath(new URL("../fixtures/shapes/", import.meta.url));

async function fixture(name: string): Promise<string> {
  return readFile(`${FIXTURE_DIR}${name}`, "utf8");
}

describe("sliceMarkdown", () => {
  it("returns prose, structured, prose for the markdown fixture", async () => {
    const text = await fixture("markdown.vibe");
    const regions = sliceMarkdown(text);

    expect(regions).toHaveLength(3);
    expect(regions[0].kind).toBe("prose");
    expect(regions[0].text).toContain("Coordinator agent that owns");
    expect(regions[1].kind).toBe("structured");
    expect(regions[1].text).toContain("persona izsha");
    expect(regions[1].text).not.toContain("```");
    expect(regions[2].kind).toBe("prose");
    expect(regions[2].text).toContain("terse");
  });

  it("offsets are correct and cover the whole source", async () => {
    const text = await fixture("markdown.vibe");
    const regions = sliceMarkdown(text);
    expect(regions[0].start).toBe(0);
    expect(regions.at(-1)!.end).toBe(text.length);
    for (let i = 1; i < regions.length; i++) {
      expect(regions[i].start).toBeGreaterThanOrEqual(regions[i - 1].end);
    }
  });

  it("strips the fence markers from structured region text", () => {
    const text = "# Title\n\nprose\n\n```vibe\nagent foo {}\n```\n\nmore prose\n";
    const regions = sliceMarkdown(text);
    const structured = regions.find((r) => r.kind === "structured");
    expect(structured?.text.trim()).toBe("agent foo {}");
  });

  it("ignores non-vibe fenced blocks (e.g. js, ts) — treats them as prose", () => {
    const text = "# T\n\n```ts\nconst x = 1\n```\n";
    const regions = sliceMarkdown(text);
    // One prose region covering everything (no structured emission).
    expect(regions.every((r) => r.kind === "prose")).toBe(true);
  });

  it("extracts ```vibe-prose#tag fences as prose regions with tag", () => {
    const text = "# T\n\n```vibe-prose#sketch1\nMake an agent.\n```\n\n```vibe\nagent foo {}\n```\n";
    const regions = sliceMarkdown(text);
    const taggedProse = regions.find((r) => r.kind === "prose" && r.tag === "sketch1");
    expect(taggedProse).toBeDefined();
    expect(taggedProse?.text.trim()).toBe("Make an agent.");
    expect(regions.find((r) => r.kind === "structured")?.text.trim()).toBe("agent foo {}");
  });
});
