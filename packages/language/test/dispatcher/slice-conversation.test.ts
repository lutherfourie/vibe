import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sliceConversation } from "../../src/dispatcher/slice-conversation.js";

const FIXTURE_DIR = fileURLToPath(new URL("../fixtures/shapes/", import.meta.url));

async function fixture(name: string): Promise<string> {
  return readFile(`${FIXTURE_DIR}${name}`, "utf8");
}

describe("sliceConversation", () => {
  it("emits one region per turn, role attached", async () => {
    const text = await fixture("conversation.vibe");
    const regions = sliceConversation(text);

    const proseRegions = regions.filter((r) => r.kind === "prose");
    const structuredRegions = regions.filter((r) => r.kind === "structured");

    // 3 turns: user / assistant (with embedded vibe block) / user.
    expect(proseRegions.length).toBeGreaterThanOrEqual(3);
    expect(structuredRegions).toHaveLength(1);
    expect(structuredRegions[0].text).toContain("persona izsha");
  });

  it("attaches role metadata to each prose region", async () => {
    const text = await fixture("conversation.vibe");
    const regions = sliceConversation(text);
    const proseRegions = regions.filter((r) => r.kind === "prose");
    const roles = proseRegions.map((r) => r.kind === "prose" ? r.role : null);
    expect(roles).toContain("user");
    expect(roles).toContain("assistant");
  });

  it("rejects sources missing a role tag", () => {
    // sliceConversation should only be called when detectShape returns
    // "conversation". As a defensive guard, calling it on a non-conversation
    // source throws rather than silently returning the whole source as prose.
    expect(() => sliceConversation("plain text with no role tags")).toThrow(
      /role tag/i,
    );
  });
});
