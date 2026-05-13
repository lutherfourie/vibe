import { describe, expect, it } from "vitest";
import {
  isReference,
  isStringLiteral,
  isTrigger,
} from "../../src/generated/ast.js";
import { firstTrigger } from "../ast-helpers.js";
import { expectParseFailure, expectParses } from "../parse-helper.js";

// Task 13: trigger primitive — spec §2.8.
//   trigger every <CronOrIntervalString> "{" <keyValuePairs> "}"
//   trigger on    <EventName>            "{" <keyValuePairs> "}"
// Required fields: `do` (tool reference; typically `plugin.<name>.<tool>`).
// Optional fields: `when` (a guard expression). v0 grammar is permissive —
// required-field / enum-shaped enforcement is a Task 15+ validator concern.
// Both shapes ride the same Trigger rule, discriminated by the `kind` token
// (`every` vs `on`), with the cron string / event name stored verbatim in
// `schedule`. Tests below cover BOTH shapes per Task 13 mandatory checklist.

describe("trigger primitive", () => {
  it("parses cron-style trigger with interval string", async () => {
    const project = await expectParses(`
      trigger every "1h" { do = plugin.asset_pipeline.health_check }
    `);
    expect(project.declarations).toHaveLength(1);
    const trigger = firstTrigger(project);
    expect(isTrigger(trigger)).toBe(true);
    expect(trigger.$type).toBe("Trigger");
    expect(trigger.kind).toBe("every");
    expect(trigger.schedule).toBe("1h");
    expect(trigger.fields).toHaveLength(1);
    const doField = trigger.fields[0];
    expect(doField.name).toBe("do");
    expect(isReference(doField.value)).toBe(true);
    if (isReference(doField.value)) {
      expect(doField.value.segments).toEqual([
        "plugin",
        "asset_pipeline",
        "health_check",
      ]);
    }
  });

  it("parses trigger with sub-hour interval", async () => {
    const project = await expectParses(`
      trigger every "30m" { do = plugin.asset_pipeline.health_check }
    `);
    expect(project.declarations).toHaveLength(1);
    const trigger = firstTrigger(project);
    expect(isTrigger(trigger)).toBe(true);
    expect(trigger.$type).toBe("Trigger");
    expect(trigger.kind).toBe("every");
    expect(trigger.schedule).toBe("30m");
  });

  it("parses event-driven trigger", async () => {
    // Second shape: `trigger on "<event-name>" { ... }`. Locks in that the
    // `on` discriminator + event-name string both round-trip through the AST.
    const project = await expectParses(`
      trigger on "asset_pipeline.promoted" {
        do = plugin.asset_pipeline.update_manifest
      }
    `);
    expect(project.declarations).toHaveLength(1);
    const trigger = firstTrigger(project);
    expect(isTrigger(trigger)).toBe(true);
    expect(trigger.$type).toBe("Trigger");
    expect(trigger.kind).toBe("on");
    expect(trigger.schedule).toBe("asset_pipeline.promoted");
    expect(trigger.fields).toHaveLength(1);
    const doField = trigger.fields[0];
    expect(doField.name).toBe("do");
    expect(isReference(doField.value)).toBe(true);
    if (isReference(doField.value)) {
      expect(doField.value.segments).toEqual([
        "plugin",
        "asset_pipeline",
        "update_manifest",
      ]);
    }
  });

  it("parses trigger with when guard", async () => {
    const project = await expectParses(`
      trigger every "1h" {
        do   = plugin.asset_pipeline.health_check
        when = "always"
      }
    `);
    expect(project.declarations).toHaveLength(1);
    const trigger = firstTrigger(project);
    expect(isTrigger(trigger)).toBe(true);
    expect(trigger.$type).toBe("Trigger");
    expect(trigger.kind).toBe("every");
    expect(trigger.fields).toHaveLength(2);
    const [doField, whenField] = trigger.fields;
    expect(doField.name).toBe("do");
    expect(whenField.name).toBe("when");
    expect(isStringLiteral(whenField.value)).toBe(true);
    if (isStringLiteral(whenField.value)) {
      expect(whenField.value.value).toBe("always");
    }
  });

  it("parses multiple triggers mixing both shapes", async () => {
    // Lock in that cron + event triggers coexist in the same project — this
    // is the canonical Izsha shape from spec §2.8 examples.
    const project = await expectParses(`
      trigger every "1h" { do = plugin.asset_pipeline.health_check }
      trigger on "asset_pipeline.promoted" {
        do = plugin.asset_pipeline.update_manifest
      }
    `);
    expect(project.declarations).toHaveLength(2);
    const [first, second] = project.declarations;
    if (!isTrigger(first) || !isTrigger(second)) {
      throw new Error("Expected both declarations to be Trigger");
    }
    expect(first.kind).toBe("every");
    expect(first.schedule).toBe("1h");
    expect(second.kind).toBe("on");
    expect(second.schedule).toBe("asset_pipeline.promoted");
  });

  it("parses trigger with an empty body (grammar permissive — Task 15 enforces required `do`)", async () => {
    // Spec §2.8 marks `do` as required, but the grammar's Trigger rule uses
    // `fields+=Field*`, so the empty body is syntactically valid. Lock it in
    // so a future grammar tightening can't break it silently. Mirrors the
    // harness/memory/persona/plugin patterns.
    const project = await expectParses(`
      trigger every "1h" { }
    `);
    const trigger = firstTrigger(project);
    expect(isTrigger(trigger)).toBe(true);
    expect(trigger.$type).toBe("Trigger");
    expect(trigger.kind).toBe("every");
    expect(trigger.fields).toHaveLength(0);
  });

  it("rejects a trigger declaration missing the body", async () => {
    // Spec §2.8 grammar requires `{ ... }`. Bodyless declaration is malformed.
    const messages = await expectParseFailure(`
      trigger every "1h"
    `);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects a trigger declaration missing the schedule string", async () => {
    // Both shapes require a string literal after `every`/`on`. Omitting it
    // — i.e. `trigger every { ... }` — is malformed.
    const messages = await expectParseFailure(`
      trigger every { do = plugin.asset_pipeline.health_check }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects a trigger declaration missing the kind discriminator", async () => {
    // `trigger "1h" { ... }` skips the `every`/`on` token entirely — the
    // grammar requires one of them between `trigger` and the schedule string.
    const messages = await expectParseFailure(`
      trigger "1h" { do = plugin.asset_pipeline.health_check }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });
});
