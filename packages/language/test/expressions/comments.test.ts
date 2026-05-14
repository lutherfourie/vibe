import { describe, expect, it } from "vitest";
import {
  isListExpression,
  isObjectExpression,
  isReference,
  isStringLiteral,
} from "../../src/generated/ast.js";
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
    expect(persona.$type).toBe("Persona");
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

  it("handles line and block comments intermixed", async () => {
    // Both comment styles in the same file, including adjacency, to catch
    // terminal-ordering regressions where one comment regex shadows another.
    const project = await expectParses(`
      // line comment
      /* block comment */
      persona p {
        // field comment
        description = /* inline */ "x"
      }
    `);
    expect(project.declarations).toHaveLength(1);
    const persona = firstPersona(project);
    expect(persona.$type).toBe("Persona");
    expect(persona.fields).toHaveLength(1);
    const field = persona.fields[0];
    expect(isStringLiteral(field.value)).toBe(true);
    if (isStringLiteral(field.value)) {
      expect(field.value.value).toBe("x");
    }
  });

  it("ignores comments inside list and object literals", async () => {
    // Hidden terminals must work inside collection grammar rules, not just
    // top-level whitespace. This is the most common breakage point if the
    // SL_COMMENT / ML_COMMENT terminals are reordered incorrectly.
    const project = await expectParses(`
      persona p {
        uses = [/* head */ plugin.a, // line
                plugin.b]
        config = { /* prelude */ host = "x", /* mid */ port = 8080 }
      }
    `);
    const persona = firstPersona(project);
    const [usesField, configField] = persona.fields;

    expect(usesField.name).toBe("uses");
    expect(isListExpression(usesField.value)).toBe(true);
    if (isListExpression(usesField.value)) {
      expect(usesField.value.items).toHaveLength(2);
      const [a, b] = usesField.value.items;
      expect(isReference(a)).toBe(true);
      if (isReference(a)) expect(a.segments).toEqual(["plugin", "a"]);
      expect(isReference(b)).toBe(true);
      if (isReference(b)) expect(b.segments).toEqual(["plugin", "b"]);
    }

    expect(configField.name).toBe("config");
    expect(isObjectExpression(configField.value)).toBe(true);
    if (isObjectExpression(configField.value)) {
      expect(configField.value.entries).toHaveLength(2);
      const [host, port] = configField.value.entries;
      expect(host.key).toBe("host");
      expect(port.key).toBe("port");
    }
  });
});
