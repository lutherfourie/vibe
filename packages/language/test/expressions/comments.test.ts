import { describe, expect, it } from "vitest";
import { isStringLiteral } from "../../src/generated/ast.js";
import { firstPersona } from "../ast-helpers.js";
import { expectParses } from "../parse-helper.js";

describe("comments", () => {
  it("ignores line comments at top level", async () => {
    const project = await expectParses(`
      // This is a line comment
      persona p { description = "x" }
    `);
    expect(project.declarations).toHaveLength(1);
    const persona = firstPersona(project);
    expect(persona.$type).toBe("Persona");
    expect(persona.name).toBe("p");
    const field = persona.fields[0];
    expect(field.name).toBe("description");
    expect(isStringLiteral(field.value)).toBe(true);
    if (isStringLiteral(field.value)) {
      expect(field.value.value).toBe("x");
    }
  });

  it("ignores line comments inside blocks", async () => {
    const project = await expectParses(`
      persona p {
        // comment here
        description = "x"
      }
    `);
    expect(project.declarations).toHaveLength(1);
    const persona = firstPersona(project);
    expect(persona.name).toBe("p");
    expect(persona.fields).toHaveLength(1);
    const field = persona.fields[0];
    expect(field.name).toBe("description");
    expect(isStringLiteral(field.value)).toBe(true);
    if (isStringLiteral(field.value)) {
      expect(field.value.value).toBe("x");
    }
  });

  it("ignores trailing line comments after a field", async () => {
    const project = await expectParses(`
      persona p {
        description = "x"  // trailing remark
      }
    `);
    expect(project.declarations).toHaveLength(1);
    const persona = firstPersona(project);
    expect(persona.fields).toHaveLength(1);
    const field = persona.fields[0];
    expect(field.name).toBe("description");
    expect(isStringLiteral(field.value)).toBe(true);
    if (isStringLiteral(field.value)) {
      // Trailing comment must not bleed into the string literal value.
      expect(field.value.value).toBe("x");
    }
  });

  it("ignores block comments", async () => {
    const project = await expectParses(`
      /* block comment */
      persona p { description = "x" }
    `);
    expect(project.declarations).toHaveLength(1);
    const persona = firstPersona(project);
    expect(persona.$type).toBe("Persona");
    expect(persona.name).toBe("p");
    const field = persona.fields[0];
    expect(field.name).toBe("description");
    expect(isStringLiteral(field.value)).toBe(true);
    if (isStringLiteral(field.value)) {
      expect(field.value.value).toBe("x");
    }
  });

  it("ignores multi-line block comments", async () => {
    const project = await expectParses(`
      /*
        multi-line
        block comment
      */
      persona p { description = "x" }
    `);
    expect(project.declarations).toHaveLength(1);
    const persona = firstPersona(project);
    expect(persona.name).toBe("p");
    const field = persona.fields[0];
    expect(field.name).toBe("description");
    expect(isStringLiteral(field.value)).toBe(true);
    if (isStringLiteral(field.value)) {
      expect(field.value.value).toBe("x");
    }
  });

  it("ignores block comments embedded between tokens", async () => {
    // Block comments are a hidden terminal, so they must be valid anywhere
    // whitespace is — including between the equals sign and the value.
    const project = await expectParses(`
      persona p { description = /* inline */ "x" }
    `);
    expect(project.declarations).toHaveLength(1);
    const persona = firstPersona(project);
    expect(persona.fields).toHaveLength(1);
    const field = persona.fields[0];
    expect(field.name).toBe("description");
    expect(isStringLiteral(field.value)).toBe(true);
    if (isStringLiteral(field.value)) {
      expect(field.value.value).toBe("x");
    }
  });
});
