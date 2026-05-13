import { describe, expect, it } from "vitest";
import {
  isListExpression,
  isObjectExpression,
  isReference,
  isStringLiteral,
} from "../../src/generated/ast.js";
import { firstPersona } from "../ast-helpers.js";
import { expectParses } from "../parse-helper.js";

// Task 6.5: structural-primitive keywords (agent, route, persona, and as new
// primitives land: memory, harness, plugin, provider, trigger) must work as
// identifier segments inside Reference / TypeReference / Field-name /
// ObjectEntry-key positions. Spec §2.9 uses the `routes = { planner = route.X }`
// shape for the canonical agent example, so these patterns are load-bearing.

describe("structural keywords as Reference segments", () => {
  it("accepts `route` as a Reference first segment", async () => {
    const project = await expectParses(`
      persona p { primary = route.code_review }
    `);
    const field = firstPersona(project).fields[0];
    expect(field.name).toBe("primary");
    expect(isReference(field.value)).toBe(true);
    if (isReference(field.value)) {
      expect(field.value.segments).toEqual(["route", "code_review"]);
    }
  });

  it("accepts `agent` as a Reference first segment", async () => {
    const project = await expectParses(`
      persona p { owner = agent.izsha }
    `);
    const field = firstPersona(project).fields[0];
    expect(field.name).toBe("owner");
    expect(isReference(field.value)).toBe(true);
    if (isReference(field.value)) {
      expect(field.value.segments).toEqual(["agent", "izsha"]);
    }
  });

  it("accepts `persona` as a Reference first segment with deep dotted form", async () => {
    const project = await expectParses(`
      persona p { voice = persona.izsha_voice.tone }
    `);
    const field = firstPersona(project).fields[0];
    expect(isReference(field.value)).toBe(true);
    if (isReference(field.value)) {
      expect(field.value.segments).toEqual(["persona", "izsha_voice", "tone"]);
    }
  });

  it("accepts keyword-prefixed references inside a list literal", async () => {
    const project = await expectParses(`
      persona p { routes = [route.planner, route.generator, agent.izsha] }
    `);
    const field = firstPersona(project).fields[0];
    expect(isListExpression(field.value)).toBe(true);
    if (isListExpression(field.value)) {
      expect(field.value.items).toHaveLength(3);
      const segs = field.value.items.map((item) =>
        isReference(item) ? item.segments : null,
      );
      expect(segs).toEqual([
        ["route", "planner"],
        ["route", "generator"],
        ["agent", "izsha"],
      ]);
    }
  });
});

describe("structural keywords as ObjectEntry keys", () => {
  it("accepts `route` and `agent` as object-entry keys", async () => {
    // The canonical spec example uses non-keyword keys like `planner`, but
    // nothing in the language should forbid a keyword in a key position.
    const project = await expectParses(`
      persona p {
        wiring = { route = route.planner, agent = agent.izsha, persona = "x" }
      }
    `);
    const field = firstPersona(project).fields[0];
    expect(isObjectExpression(field.value)).toBe(true);
    if (isObjectExpression(field.value)) {
      const keys = field.value.entries.map((e) => e.key);
      expect(keys).toEqual(["route", "agent", "persona"]);
    }
  });
});

describe("structural keywords as Field names", () => {
  it("accepts `persona` as a Field name", async () => {
    // Spec uses `agent { persona = persona.izsha_voice }` — the field name
    // collides with the declaration keyword. With Name in place this parses.
    const project = await expectParses(`
      persona p { persona = persona.izsha_voice }
    `);
    const field = firstPersona(project).fields[0];
    expect(field.name).toBe("persona");
    expect(isReference(field.value)).toBe(true);
    if (isReference(field.value)) {
      expect(field.value.segments).toEqual(["persona", "izsha_voice"]);
    }
  });
});

describe("structural keywords as TypeReference segments", () => {
  it("accepts `agent` as a TypeReference segment", async () => {
    const project = await expectParses(`
      persona p { owner : agent.Handle = "x" }
    `);
    const field = firstPersona(project).fields[0];
    expect(field.type?.$type).toBe("TypeReference");
    expect(field.type?.segments).toEqual(["agent", "Handle"]);
    expect(isStringLiteral(field.value)).toBe(true);
  });

  it("accepts `route` and `persona` as TypeReference segments in dotted forms", async () => {
    const project = await expectParses(`
      persona p {
        target : route.Endpoint = "x"
        voice : persona.Voice.Tone = "y"
      }
    `);
    const persona = firstPersona(project);
    expect(persona.fields).toHaveLength(2);
    expect(persona.fields[0].type?.segments).toEqual(["route", "Endpoint"]);
    expect(persona.fields[1].type?.segments).toEqual([
      "persona",
      "Voice",
      "Tone",
    ]);
  });
});
