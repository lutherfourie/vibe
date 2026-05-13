import { describe, expect, it } from "vitest";
import {
  isBooleanLiteral,
  isNullLiteral,
  isNumberLiteral,
  isPersona,
  isStringLiteral,
} from "../../src/generated/ast.js";
import type { Persona } from "../../src/generated/ast.js";
import { expectParses } from "../parse-helper.js";

function firstPersona(project: { declarations: unknown[] }): Persona {
  const decl = project.declarations[0];
  if (!isPersona(decl)) {
    throw new Error(`Expected first declaration to be Persona, got ${(decl as { $type?: string })?.$type}`);
  }
  return decl;
}

describe("literal expressions", () => {
  it("parses string literals (single line)", async () => {
    const project = await expectParses(`
      persona p { description = "coordinator, dry" }
    `);
    expect(project.declarations).toHaveLength(1);
    const field = firstPersona(project).fields[0];
    expect(field.name).toBe("description");
    expect(isStringLiteral(field.value)).toBe(true);
    if (isStringLiteral(field.value)) {
      expect(field.value.value).toBe("coordinator, dry");
    }
  });

  it("parses integer literals", async () => {
    const project = await expectParses(`
      persona p { verbosity_level = 3 }
    `);
    expect(project.declarations).toHaveLength(1);
    const field = firstPersona(project).fields[0];
    expect(field.name).toBe("verbosity_level");
    expect(isNumberLiteral(field.value)).toBe(true);
    if (isNumberLiteral(field.value)) {
      expect(field.value.value).toBe(3);
    }
  });

  it("parses decimal literals", async () => {
    const project = await expectParses(`
      persona p { temperature = 0.3 }
    `);
    expect(project.declarations).toHaveLength(1);
    const field = firstPersona(project).fields[0];
    expect(field.name).toBe("temperature");
    expect(isNumberLiteral(field.value)).toBe(true);
    if (isNumberLiteral(field.value)) {
      expect(field.value.value).toBeCloseTo(0.3);
    }
  });

  it("parses boolean literals", async () => {
    const project = await expectParses(`
      persona p { active = true }
      persona q { active = false }
    `);
    expect(project.declarations).toHaveLength(2);
    const pField = firstPersona(project).fields[0];
    expect(isBooleanLiteral(pField.value)).toBe(true);
    if (isBooleanLiteral(pField.value)) {
      expect(pField.value.value).toBe("true");
    }
    const q = project.declarations[1];
    if (!isPersona(q)) throw new Error("expected second declaration to be Persona");
    const qField = q.fields[0];
    expect(isBooleanLiteral(qField.value)).toBe(true);
    if (isBooleanLiteral(qField.value)) {
      expect(qField.value.value).toBe("false");
    }
  });

  it("parses null literal", async () => {
    const project = await expectParses(`
      persona p { description = null }
    `);
    expect(project.declarations).toHaveLength(1);
    const field = firstPersona(project).fields[0];
    expect(field.name).toBe("description");
    expect(isNullLiteral(field.value)).toBe(true);
  });
});
