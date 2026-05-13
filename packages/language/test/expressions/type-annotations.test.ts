import { describe, expect, it } from "vitest";
import {
  isReference,
  isStringLiteral,
} from "../../src/generated/ast.js";
import { firstPersona } from "../ast-helpers.js";
import { expectParseFailure, expectParses } from "../parse-helper.js";

describe("type annotations on fields", () => {
  it("parses field without annotation (annotation absent)", async () => {
    const project = await expectParses(`
      persona p { description = "coordinator" }
    `);
    expect(project.declarations).toHaveLength(1);
    const field = firstPersona(project).fields[0];
    expect(field.name).toBe("description");
    // When the optional annotation is omitted, `type` should be undefined.
    expect(field.type).toBeUndefined();
    expect(isStringLiteral(field.value)).toBe(true);
    if (isStringLiteral(field.value)) {
      expect(field.value.value).toBe("coordinator");
    }
  });

  it("parses field with simple type annotation", async () => {
    const project = await expectParses(`
      persona p { description : String = "coordinator" }
    `);
    expect(project.declarations).toHaveLength(1);
    const field = firstPersona(project).fields[0];
    expect(field.name).toBe("description");
    expect(field.type).toBeDefined();
    expect(field.type?.$type).toBe("TypeReference");
    expect(field.type?.segments).toEqual(["String"]);
    expect(isStringLiteral(field.value)).toBe(true);
    if (isStringLiteral(field.value)) {
      expect(field.value.value).toBe("coordinator");
    }
  });

  it("parses field with dotted type annotation", async () => {
    const project = await expectParses(`
      persona p { memory : memory.Spineflow = memory.izsha_global }
    `);
    expect(project.declarations).toHaveLength(1);
    const field = firstPersona(project).fields[0];
    expect(field.name).toBe("memory");
    expect(field.type).toBeDefined();
    expect(field.type?.$type).toBe("TypeReference");
    expect(field.type?.segments).toEqual(["memory", "Spineflow"]);
    expect(isReference(field.value)).toBe(true);
    if (isReference(field.value)) {
      expect(field.value.segments).toEqual(["memory", "izsha_global"]);
    }
  });

  it("parses multi-segment dotted type annotation", async () => {
    const project = await expectParses(`
      persona p { tool : plugin.asset_pipeline.Handle = plugin.asset_pipeline.list_backlog }
    `);
    expect(project.declarations).toHaveLength(1);
    const field = firstPersona(project).fields[0];
    expect(field.name).toBe("tool");
    expect(field.type).toBeDefined();
    expect(field.type?.$type).toBe("TypeReference");
    expect(field.type?.segments).toEqual([
      "plugin",
      "asset_pipeline",
      "Handle",
    ]);
    expect(isReference(field.value)).toBe(true);
  });
});

describe("malformed type annotations", () => {
  it("rejects annotation with no type name (bare colon before '=')", async () => {
    const messages = await expectParseFailure(`
      persona p { description : = "coordinator" }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects annotation with trailing dot in dotted type", async () => {
    const messages = await expectParseFailure(`
      persona p { memory : memory. = memory.izsha_global }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects annotation with leading dot", async () => {
    const messages = await expectParseFailure(`
      persona p { memory : .Spineflow = memory.izsha_global }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });
});
