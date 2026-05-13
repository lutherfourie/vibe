import { describe, expect, it } from "vitest";
import {
  isBooleanLiteral,
  isListExpression,
  isNumberLiteral,
  isObjectExpression,
  isPersona,
  isReference,
  isStringLiteral,
} from "../../src/generated/ast.js";
import type { Persona } from "../../src/generated/ast.js";
import { expectParseFailure, expectParses } from "../parse-helper.js";

function firstPersona(project: { declarations: unknown[] }): Persona {
  const decl = project.declarations[0];
  if (!isPersona(decl)) {
    throw new Error(
      `Expected first declaration to be Persona, got ${(decl as { $type?: string })?.$type}`,
    );
  }
  return decl;
}

describe("list expressions", () => {
  it("parses empty list", async () => {
    const project = await expectParses(`
      persona p { uses = [] }
    `);
    expect(project.declarations).toHaveLength(1);
    const field = firstPersona(project).fields[0];
    expect(field.name).toBe("uses");
    expect(isListExpression(field.value)).toBe(true);
    if (isListExpression(field.value)) {
      expect(field.value.items).toEqual([]);
    }
  });

  it("parses list of references", async () => {
    const project = await expectParses(`
      persona p { uses = [plugin.asset_pipeline, plugin.deploy] }
    `);
    expect(project.declarations).toHaveLength(1);
    const field = firstPersona(project).fields[0];
    expect(field.name).toBe("uses");
    expect(isListExpression(field.value)).toBe(true);
    if (isListExpression(field.value)) {
      expect(field.value.items).toHaveLength(2);
      const [first, second] = field.value.items;
      expect(isReference(first)).toBe(true);
      if (isReference(first)) {
        expect(first.segments).toEqual(["plugin", "asset_pipeline"]);
      }
      expect(isReference(second)).toBe(true);
      if (isReference(second)) {
        expect(second.segments).toEqual(["plugin", "deploy"]);
      }
    }
  });

  it("parses list with trailing comma", async () => {
    const project = await expectParses(`
      persona p { uses = [plugin.asset_pipeline,] }
    `);
    expect(project.declarations).toHaveLength(1);
    const field = firstPersona(project).fields[0];
    expect(isListExpression(field.value)).toBe(true);
    if (isListExpression(field.value)) {
      expect(field.value.items).toHaveLength(1);
      const [only] = field.value.items;
      expect(isReference(only)).toBe(true);
      if (isReference(only)) {
        expect(only.segments).toEqual(["plugin", "asset_pipeline"]);
      }
    }
  });

  it("parses list of mixed literals", async () => {
    const project = await expectParses(`
      persona p { tags = ["urgent", "v0", 1, true] }
    `);
    expect(project.declarations).toHaveLength(1);
    const field = firstPersona(project).fields[0];
    expect(field.name).toBe("tags");
    expect(isListExpression(field.value)).toBe(true);
    if (isListExpression(field.value)) {
      expect(field.value.items).toHaveLength(4);
      const [a, b, c, d] = field.value.items;
      expect(isStringLiteral(a)).toBe(true);
      if (isStringLiteral(a)) expect(a.value).toBe("urgent");
      expect(isStringLiteral(b)).toBe(true);
      if (isStringLiteral(b)) expect(b.value).toBe("v0");
      expect(isNumberLiteral(c)).toBe(true);
      if (isNumberLiteral(c)) expect(c.value).toBe(1);
      expect(isBooleanLiteral(d)).toBe(true);
      if (isBooleanLiteral(d)) expect(d.value).toBe("true");
    }
  });
});

describe("object expressions", () => {
  it("parses empty object", async () => {
    const project = await expectParses(`
      persona p { routes = {} }
    `);
    expect(project.declarations).toHaveLength(1);
    const field = firstPersona(project).fields[0];
    expect(field.name).toBe("routes");
    expect(isObjectExpression(field.value)).toBe(true);
    if (isObjectExpression(field.value)) {
      expect(field.value.entries).toEqual([]);
    }
  });

  it("parses object with key-value pairs", async () => {
    // NB: avoid using the reserved keyword `route` as a Reference segment —
    // it's a top-level declaration keyword (Task 1). Use `plugin.*` style refs.
    const project = await expectParses(`
      persona p {
        routes = { planner = plugin.planner, generator = plugin.generator }
      }
    `);
    expect(project.declarations).toHaveLength(1);
    const field = firstPersona(project).fields[0];
    expect(field.name).toBe("routes");
    expect(isObjectExpression(field.value)).toBe(true);
    if (isObjectExpression(field.value)) {
      expect(field.value.entries).toHaveLength(2);
      const [planner, generator] = field.value.entries;
      expect(planner.key).toBe("planner");
      expect(isReference(planner.value)).toBe(true);
      if (isReference(planner.value)) {
        expect(planner.value.segments).toEqual(["plugin", "planner"]);
      }
      expect(generator.key).toBe("generator");
      expect(isReference(generator.value)).toBe(true);
      if (isReference(generator.value)) {
        expect(generator.value.segments).toEqual(["plugin", "generator"]);
      }
    }
  });

  it("parses nested list inside object", async () => {
    const project = await expectParses(`
      persona p {
        groups = { workers = [plugin.a, plugin.b], heroes = [plugin.c] }
      }
    `);
    expect(project.declarations).toHaveLength(1);
    const field = firstPersona(project).fields[0];
    expect(field.name).toBe("groups");
    expect(isObjectExpression(field.value)).toBe(true);
    if (isObjectExpression(field.value)) {
      expect(field.value.entries).toHaveLength(2);
      const [workers, heroes] = field.value.entries;
      expect(workers.key).toBe("workers");
      expect(isListExpression(workers.value)).toBe(true);
      if (isListExpression(workers.value)) {
        expect(workers.value.items).toHaveLength(2);
        const [a, b] = workers.value.items;
        expect(isReference(a)).toBe(true);
        if (isReference(a)) expect(a.segments).toEqual(["plugin", "a"]);
        expect(isReference(b)).toBe(true);
        if (isReference(b)) expect(b.segments).toEqual(["plugin", "b"]);
      }
      expect(heroes.key).toBe("heroes");
      expect(isListExpression(heroes.value)).toBe(true);
      if (isListExpression(heroes.value)) {
        expect(heroes.value.items).toHaveLength(1);
        const [c] = heroes.value.items;
        expect(isReference(c)).toBe(true);
        if (isReference(c)) expect(c.segments).toEqual(["plugin", "c"]);
      }
    }
  });

  it("parses object with trailing comma", async () => {
    const project = await expectParses(`
      persona p { routes = { planner = plugin.planner, } }
    `);
    expect(project.declarations).toHaveLength(1);
    const field = firstPersona(project).fields[0];
    expect(isObjectExpression(field.value)).toBe(true);
    if (isObjectExpression(field.value)) {
      expect(field.value.entries).toHaveLength(1);
      expect(field.value.entries[0].key).toBe("planner");
      expect(isReference(field.value.entries[0].value)).toBe(true);
    }
  });
});

describe("malformed collections", () => {
  it("rejects list missing closing bracket", async () => {
    const messages = await expectParseFailure(`
      persona p { uses = [plugin.a, plugin.b }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects object missing closing brace", async () => {
    const messages = await expectParseFailure(`
      persona p { routes = { planner = plugin.planner }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects object entry with missing value", async () => {
    const messages = await expectParseFailure(`
      persona p { routes = { planner = } }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects object entry with missing '=' separator", async () => {
    const messages = await expectParseFailure(`
      persona p { routes = { planner route.planner } }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });
});
