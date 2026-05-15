import { describe, expect, it } from "vitest";
import {
  isMemory,
  isReference,
  isStringLiteral,
} from "../../src/generated/ast.js";
import { firstMemory } from "../ast-helpers.js";
import { expectParseFailure, expectParses } from "../parse-helper.js";

// Task 10: memory primitive — spec §2.6.
//   memory <Identifier> "{" <keyValuePairs> "}"
// Required fields: `kind` (v0 only `spineflow`), `namespace` (string).
// Optional fields: `on_load` (expression — typically a recall call shape),
// `fog_threshold` (low|medium|high).
// Enum-like values land as single-segment References (no enum constraint at the
// grammar layer — Task 15+ validators police value shape). Strings stay strings.

describe("memory primitive", () => {
  it("parses minimal memory binding", async () => {
    const project = await expectParses(`
      memory izsha_global {
        kind      = spineflow
        namespace = "izsha.global"
      }
    `);
    expect(project.declarations).toHaveLength(1);
    const memory = firstMemory(project);
    expect(isMemory(memory)).toBe(true);
    expect(memory.$type).toBe("Memory");
    expect(memory.name).toBe("izsha_global");
    expect(memory.fields).toHaveLength(2);
    const [kind, namespace] = memory.fields;
    expect(kind.name).toBe("kind");
    expect(isReference(kind.value)).toBe(true);
    if (isReference(kind.value)) {
      expect(kind.value.segments).toEqual(["spineflow"]);
    }
    expect(namespace.name).toBe("namespace");
    expect(isStringLiteral(namespace.value)).toBe(true);
    if (isStringLiteral(namespace.value)) {
      expect(namespace.value.value).toBe("izsha.global");
    }
  });

  it("parses memory binding with on_load reference", async () => {
    const project = await expectParses(`
      memory izsha_global {
        kind      = spineflow
        namespace = "izsha.global"
        on_load   = recall_recent
      }
    `);
    expect(project.declarations).toHaveLength(1);
    const memory = firstMemory(project);
    expect(isMemory(memory)).toBe(true);
    expect(memory.name).toBe("izsha_global");
    expect(memory.fields.map((f) => f.name)).toEqual([
      "kind",
      "namespace",
      "on_load",
    ]);
    const onLoad = memory.fields[2];
    expect(isReference(onLoad.value)).toBe(true);
    if (isReference(onLoad.value)) {
      expect(onLoad.value.segments).toEqual(["recall_recent"]);
    }
  });

  it("parses memory binding with fog_threshold enum", async () => {
    const project = await expectParses(`
      memory izsha_global {
        kind          = spineflow
        namespace     = "izsha.global"
        fog_threshold = medium
      }
    `);
    expect(project.declarations).toHaveLength(1);
    const memory = firstMemory(project);
    expect(isMemory(memory)).toBe(true);
    expect(memory.fields.map((f) => f.name)).toEqual([
      "kind",
      "namespace",
      "fog_threshold",
    ]);
    const fog = memory.fields[2];
    expect(isReference(fog.value)).toBe(true);
    if (isReference(fog.value)) {
      expect(fog.value.segments).toEqual(["medium"]);
    }
  });

  it("parses memory binding with all optional fields together", async () => {
    // Spec §2.6 names `on_load` and `fog_threshold` as optional; both can
    // appear alongside the required fields. Each fog_threshold value lands as
    // a single-segment Reference, matching the bare-identifier enum pattern
    // used by persona's pushback/uncertainty/verbosity in Task 9.
    const project = await expectParses(`
      memory izsha_global {
        kind          = spineflow
        namespace     = "izsha.global"
        on_load       = recall_recent
        fog_threshold = high
      }
    `);
    const memory = firstMemory(project);
    expect(isMemory(memory)).toBe(true);
    expect(memory.fields.map((f) => f.name)).toEqual([
      "kind",
      "namespace",
      "on_load",
      "fog_threshold",
    ]);
    const [, namespace, onLoad, fog] = memory.fields;
    expect(isStringLiteral(namespace.value)).toBe(true);
    if (isStringLiteral(namespace.value)) {
      expect(namespace.value.value).toBe("izsha.global");
    }
    expect(isReference(onLoad.value)).toBe(true);
    if (isReference(onLoad.value)) {
      expect(onLoad.value.segments).toEqual(["recall_recent"]);
    }
    expect(isReference(fog.value)).toBe(true);
    if (isReference(fog.value)) {
      expect(fog.value.segments).toEqual(["high"]);
    }
  });

  it("parses memory binding with dotted on_load reference", async () => {
    // The spec §2.6 narrative describes on_load as "an expression invoked at
    // agent boot — typically `recall(<query>, limit: <n>)`". v0 has no call
    // expressions yet, so the syntactic surface that's actually expressive
    // today is a dotted Reference (e.g. `memory.izsha_global.recall_recent`).
    // The grammar accepts any Expression here; lock the dotted shape in.
    const project = await expectParses(`
      memory izsha_global {
        kind      = spineflow
        namespace = "izsha.global"
        on_load   = memory.izsha_global.recall_recent
      }
    `);
    const memory = firstMemory(project);
    expect(isMemory(memory)).toBe(true);
    const onLoad = memory.fields[2];
    expect(onLoad.name).toBe("on_load");
    expect(isReference(onLoad.value)).toBe(true);
    if (isReference(onLoad.value)) {
      expect(onLoad.value.segments).toEqual([
        "memory",
        "izsha_global",
        "recall_recent",
      ]);
    }
  });

  it("parses memory binding with an empty body (grammar permissive — Task 15 enforces required fields)", async () => {
    // Spec §2.6 names `kind` and `namespace` as required, but that's a
    // validator concern. The grammar's Memory rule uses `fields+=Field*`, so
    // the empty body is syntactically valid. Lock it in so a future grammar
    // tightening can't break it silently. Mirrors the persona Task 9 pattern.
    const project = await expectParses(`
      memory empty_memory { }
    `);
    const memory = firstMemory(project);
    expect(isMemory(memory)).toBe(true);
    expect(memory.name).toBe("empty_memory");
    expect(memory.fields).toHaveLength(0);
  });

  it("parses multiple memory declarations", async () => {
    const project = await expectParses(`
      memory izsha_global { kind = spineflow  namespace = "izsha.global" }
      memory scout_local  { kind = spineflow  namespace = "scout.local"  fog_threshold = low }
    `);
    expect(project.declarations).toHaveLength(2);
    const [first, second] = project.declarations;
    if (!isMemory(first) || !isMemory(second)) {
      throw new Error("Expected both declarations to be Memory");
    }
    expect(first.name).toBe("izsha_global");
    expect(first.fields.map((f) => f.name)).toEqual(["kind", "namespace"]);
    expect(second.name).toBe("scout_local");
    expect(second.fields.map((f) => f.name)).toEqual([
      "kind",
      "namespace",
      "fog_threshold",
    ]);
    const fog = second.fields[2];
    expect(isReference(fog.value)).toBe(true);
    if (isReference(fog.value)) {
      expect(fog.value.segments).toEqual(["low"]);
    }
  });

  it("rejects a memory declaration missing the body", async () => {
    // Spec §2.6 grammar requires `{ ... }`. Bodyless declaration is malformed.
    const messages = await expectParseFailure(`
      memory izsha_global
    `);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects a memory declaration missing the name", async () => {
    // `memory <Identifier> { ... }` — without the identifier this can't bind.
    const messages = await expectParseFailure(`
      memory { kind = spineflow  namespace = "izsha.global" }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects a memory field missing its value", async () => {
    // Field is `name=Name (':' type=TypeReference)? '=' value=Expression` —
    // omitting `= <expr>` is malformed.
    const messages = await expectParseFailure(`
      memory izsha_global { kind }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });
});
