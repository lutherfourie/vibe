import { describe, expect, it } from "vitest";
import {
  isPersona,
  isReference,
  isStringLiteral,
} from "../../src/generated/ast.js";
import { firstPersona } from "../ast-helpers.js";
import { expectParseFailure, expectParses } from "../parse-helper.js";

// Task 9: persona primitive — full field set per spec §2.5.
//   persona <Identifier> "{" <keyValuePairs> "}"
// Required field: `description` (string).
// Optional fields: `pushback` (low|medium|high), `uncertainty` (hidden|explicit),
// `verbosity` (terse|medium|verbose).
// Enum-style values land as single-segment References (no enum constraint at
// the grammar layer — Task 15+ validators police value shape). The grammar is
// already in place from earlier tasks; this test pins the surface.

describe("persona primitive", () => {
  it("parses persona with minimal description", async () => {
    const project = await expectParses(`
      persona izsha_voice { description = "coordinator, dry" }
    `);
    expect(project.declarations).toHaveLength(1);
    const persona = firstPersona(project);
    expect(isPersona(persona)).toBe(true);
    expect(persona.name).toBe("izsha_voice");
    expect(persona.fields).toHaveLength(1);
    const description = persona.fields[0];
    expect(description.name).toBe("description");
    expect(isStringLiteral(description.value)).toBe(true);
    if (isStringLiteral(description.value)) {
      expect(description.value.value).toBe("coordinator, dry");
    }
  });

  it("parses persona with full optional fields", async () => {
    const project = await expectParses(`
      persona izsha_voice {
        description = "coordinator, dry, pushes back on speculative work"
        pushback    = high
        uncertainty = explicit
        verbosity   = terse
      }
    `);
    expect(project.declarations).toHaveLength(1);
    const persona = firstPersona(project);
    expect(isPersona(persona)).toBe(true);
    expect(persona.name).toBe("izsha_voice");
    expect(persona.fields.map((f) => f.name)).toEqual([
      "description",
      "pushback",
      "uncertainty",
      "verbosity",
    ]);
    const [description, pushback, uncertainty, verbosity] = persona.fields;
    // description is a string literal.
    expect(isStringLiteral(description.value)).toBe(true);
    if (isStringLiteral(description.value)) {
      expect(description.value.value).toBe(
        "coordinator, dry, pushes back on speculative work",
      );
    }
    // pushback / uncertainty / verbosity are bare-identifier References
    // (single-segment). Spec §2.5 documents enum-like values; the grammar
    // accepts any Reference, and a future validator (Task 15+) will reject
    // out-of-set values.
    for (const [field, expected] of [
      [pushback, "high"],
      [uncertainty, "explicit"],
      [verbosity, "terse"],
    ] as const) {
      expect(isReference(field.value)).toBe(true);
      if (isReference(field.value)) {
        expect(field.value.segments).toEqual([expected]);
      }
    }
  });

  it("parses persona with string-shaped optional values (spec example form)", async () => {
    // The spec §2.5 example uses quoted strings for `pushback` and
    // `uncertainty` (`pushback = "high"`). The grammar must accept that shape
    // too — Field's value is any Expression, so quoted enum-like values are
    // syntactically valid alongside the bare-identifier form above.
    const project = await expectParses(`
      persona izsha_voice {
        description = "coordinator, dry, pushes back on speculative work"
        pushback    = "high"
        uncertainty = "explicit"
      }
    `);
    const persona = firstPersona(project);
    expect(isPersona(persona)).toBe(true);
    expect(persona.fields).toHaveLength(3);
    const [, pushback, uncertainty] = persona.fields;
    expect(pushback.name).toBe("pushback");
    expect(isStringLiteral(pushback.value)).toBe(true);
    if (isStringLiteral(pushback.value)) {
      expect(pushback.value.value).toBe("high");
    }
    expect(uncertainty.name).toBe("uncertainty");
    expect(isStringLiteral(uncertainty.value)).toBe(true);
    if (isStringLiteral(uncertainty.value)) {
      expect(uncertainty.value.value).toBe("explicit");
    }
  });

  it("parses multiple persona declarations", async () => {
    const project = await expectParses(`
      persona izsha_voice { description = "coordinator, dry" }
      persona scout_voice { description = "fast scout, terse"  verbosity = terse }
    `);
    expect(project.declarations).toHaveLength(2);
    const [first, second] = project.declarations;
    if (!isPersona(first) || !isPersona(second)) {
      throw new Error("Expected both declarations to be Persona");
    }
    expect(first.name).toBe("izsha_voice");
    expect(first.fields).toHaveLength(1);
    expect(first.fields[0].name).toBe("description");
    expect(second.name).toBe("scout_voice");
    expect(second.fields.map((f) => f.name)).toEqual([
      "description",
      "verbosity",
    ]);
    const verbosity = second.fields[1];
    expect(isReference(verbosity.value)).toBe(true);
    if (isReference(verbosity.value)) {
      expect(verbosity.value.segments).toEqual(["terse"]);
    }
  });

  it("parses persona with an empty body (grammar permissive — Task 15 enforces `description`)", async () => {
    // Spec §2.5 names `description` as required, but that's a validator
    // concern. The grammar's Persona rule uses `fields+=Field*`, so the empty
    // body is syntactically valid. Lock it in so a future grammar tightening
    // can't break it silently.
    const project = await expectParses(`
      persona empty_persona { }
    `);
    const persona = firstPersona(project);
    expect(isPersona(persona)).toBe(true);
    expect(persona.name).toBe("empty_persona");
    expect(persona.fields).toHaveLength(0);
  });

  it("rejects a persona declaration missing the body", async () => {
    // Spec §2.5 grammar requires `{ ... }`. Bodyless declaration is malformed.
    const messages = await expectParseFailure(`
      persona izsha_voice
    `);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects a persona declaration missing the name", async () => {
    // `persona <Identifier> { ... }` — without the identifier this can't bind.
    const messages = await expectParseFailure(`
      persona { description = "no name" }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects a persona field missing its value", async () => {
    // Field is `name=Name (':' type=TypeReference)? '=' value=Expression` —
    // omitting `= <expr>` is malformed.
    const messages = await expectParseFailure(`
      persona izsha_voice { description }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });
});
