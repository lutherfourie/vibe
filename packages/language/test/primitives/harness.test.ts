import { describe, expect, it } from "vitest";
import { isHarness, isReference } from "../../src/generated/ast.js";
import { firstHarness } from "../ast-helpers.js";
import { expectParseFailure, expectParses } from "../parse-helper.js";

// Task 11: harness primitive — spec §2.7.
//   harness <Identifier> "{" <keyValuePairs> "}"
// Required fields: `kind` (enum: `planner_generator_evaluator` | `brain_hands_session`).
// v0 grammar is permissive — enum constraint is a Task 15+ validator concern.
// Enum-like values land as single-segment References, mirroring memory's
// `kind = spineflow` shape.

describe("harness primitive", () => {
  it("parses planner-generator-evaluator harness", async () => {
    const project = await expectParses(`
      harness asset_drain { kind = planner_generator_evaluator }
    `);
    expect(project.declarations).toHaveLength(1);
    const harness = firstHarness(project);
    expect(isHarness(harness)).toBe(true);
    expect(harness.$type).toBe("Harness");
    expect(harness.name).toBe("asset_drain");
    expect(harness.fields).toHaveLength(1);
    const kind = harness.fields[0];
    expect(kind.name).toBe("kind");
    expect(isReference(kind.value)).toBe(true);
    if (isReference(kind.value)) {
      expect(kind.value.segments).toEqual(["planner_generator_evaluator"]);
    }
  });

  it("parses brain-hands-session harness", async () => {
    const project = await expectParses(`
      harness fast_loop { kind = brain_hands_session }
    `);
    expect(project.declarations).toHaveLength(1);
    const harness = firstHarness(project);
    expect(isHarness(harness)).toBe(true);
    expect(harness.$type).toBe("Harness");
    expect(harness.name).toBe("fast_loop");
    expect(harness.fields).toHaveLength(1);
    const kind = harness.fields[0];
    expect(kind.name).toBe("kind");
    expect(isReference(kind.value)).toBe(true);
    if (isReference(kind.value)) {
      expect(kind.value.segments).toEqual(["brain_hands_session"]);
    }
  });

  it("parses harness with an empty body (grammar permissive — Task 15 enforces required `kind`)", async () => {
    // Spec §2.7 marks `kind` as required, but the grammar's Harness rule uses
    // `fields+=Field*`, so the empty body is syntactically valid. Lock it in
    // so a future grammar tightening can't break it silently. Mirrors the
    // memory Task 10 / persona Task 9 patterns.
    const project = await expectParses(`
      harness empty_harness { }
    `);
    const harness = firstHarness(project);
    expect(isHarness(harness)).toBe(true);
    expect(harness.$type).toBe("Harness");
    expect(harness.name).toBe("empty_harness");
    expect(harness.fields).toHaveLength(0);
  });

  it("parses multiple harness declarations", async () => {
    const project = await expectParses(`
      harness asset_drain { kind = planner_generator_evaluator }
      harness fast_loop   { kind = brain_hands_session }
    `);
    expect(project.declarations).toHaveLength(2);
    const [first, second] = project.declarations;
    if (!isHarness(first) || !isHarness(second)) {
      throw new Error("Expected both declarations to be Harness");
    }
    expect(first.$type).toBe("Harness");
    expect(second.$type).toBe("Harness");
    expect(first.name).toBe("asset_drain");
    expect(second.name).toBe("fast_loop");
    const firstKind = first.fields[0];
    const secondKind = second.fields[0];
    expect(isReference(firstKind.value)).toBe(true);
    if (isReference(firstKind.value)) {
      expect(firstKind.value.segments).toEqual(["planner_generator_evaluator"]);
    }
    expect(isReference(secondKind.value)).toBe(true);
    if (isReference(secondKind.value)) {
      expect(secondKind.value.segments).toEqual(["brain_hands_session"]);
    }
  });

  it("rejects a harness declaration missing the body", async () => {
    // Spec §2.7 grammar requires `{ ... }`. Bodyless declaration is malformed.
    const messages = await expectParseFailure(`
      harness asset_drain
    `);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects a harness declaration missing the name", async () => {
    // `harness <Identifier> { ... }` — without the identifier this can't bind.
    const messages = await expectParseFailure(`
      harness { kind = planner_generator_evaluator }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects a harness field missing its value", async () => {
    // Field is `name=Name (':' type=TypeReference)? '=' value=Expression` —
    // omitting `= <expr>` is malformed.
    const messages = await expectParseFailure(`
      harness asset_drain { kind }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });
});
