import { describe, expect, it } from "vitest";
import { isPersona, isReference } from "../../src/generated/ast.js";
import type { Persona } from "../../src/generated/ast.js";
import { expectParses } from "../parse-helper.js";

function firstPersona(project: { declarations: unknown[] }): Persona {
  const decl = project.declarations[0];
  if (!isPersona(decl)) {
    throw new Error(
      `Expected first declaration to be Persona, got ${(decl as { $type?: string })?.$type}`,
    );
  }
  return decl;
}

describe("reference expressions", () => {
  it("parses single-segment identifier as a value", async () => {
    const project = await expectParses(`
      persona p { profile = izsha_voice }
    `);
    expect(project.declarations).toHaveLength(1);
    const field = firstPersona(project).fields[0];
    expect(field.name).toBe("profile");
    expect(isReference(field.value)).toBe(true);
    if (isReference(field.value)) {
      expect(field.value.segments).toEqual(["izsha_voice"]);
    }
  });

  it("parses two-segment dotted identifier", async () => {
    const project = await expectParses(`
      persona p { provider = cerebras.glm_4_7 }
    `);
    expect(project.declarations).toHaveLength(1);
    const field = firstPersona(project).fields[0];
    expect(field.name).toBe("provider");
    expect(isReference(field.value)).toBe(true);
    if (isReference(field.value)) {
      expect(field.value.segments).toEqual(["cerebras", "glm_4_7"]);
    }
  });

  it("parses three-segment dotted identifier", async () => {
    const project = await expectParses(`
      persona p { tool = plugin.asset_pipeline.list_backlog }
    `);
    expect(project.declarations).toHaveLength(1);
    const field = firstPersona(project).fields[0];
    expect(field.name).toBe("tool");
    expect(isReference(field.value)).toBe(true);
    if (isReference(field.value)) {
      expect(field.value.segments).toEqual([
        "plugin",
        "asset_pipeline",
        "list_backlog",
      ]);
    }
  });
});
