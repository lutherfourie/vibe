import { describe, expect, it } from "vitest";
import { isReference } from "../../src/generated/ast.js";
import { firstPersona } from "../ast-helpers.js";
import { expectParseFailure, expectParses } from "../parse-helper.js";

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

describe("malformed references", () => {
  it("rejects trailing dot", async () => {
    const messages = await expectParseFailure(`
      persona p { tool = plugin.asset_pipeline. }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects leading dot", async () => {
    const messages = await expectParseFailure(`
      persona p { tool = .plugin }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects double dot between segments", async () => {
    const messages = await expectParseFailure(`
      persona p { tool = plugin..list_backlog }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });
});
