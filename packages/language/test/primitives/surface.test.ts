import { describe, expect, it } from "vitest";
import { isReference, isStringLiteral } from "../../src/generated/ast.js";
import { expectParseFailure, expectParses } from "../parse-helper.js";

describe("surface primitive", () => {
  it("parses a Codex local execution surface with adapter fields", async () => {
    const project = await expectParses(`
      surface codex.local {
        kind     = codex
        mode     = local
        guidance = "AGENTS.md"
        skills   = "./.agents/skills"
      }
    `);

    expect(project.declarations).toHaveLength(1);
    const surface = project.declarations[0] as {
      $type?: string;
      name?: { segments: string[] };
      fields?: Array<{ name: string; value: unknown }>;
    };

    expect(surface.$type).toBe("Surface");
    expect(surface.name?.segments).toEqual(["codex", "local"]);
    expect(surface.fields?.map((field) => field.name)).toEqual([
      "kind",
      "mode",
      "guidance",
      "skills",
    ]);

    const kind = surface.fields?.[0]?.value;
    expect(isReference(kind)).toBe(true);
    if (isReference(kind)) {
      expect(kind.segments).toEqual(["codex"]);
    }

    const guidance = surface.fields?.[2]?.value;
    expect(isStringLiteral(guidance)).toBe(true);
    if (isStringLiteral(guidance)) {
      expect(guidance.value).toBe("AGENTS.md");
    }
  });

  it("rejects a surface declaration missing the body", async () => {
    const messages = await expectParseFailure(`
      surface codex.local
    `);

    expect(messages.length).toBeGreaterThan(0);
  });
});
