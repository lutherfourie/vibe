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
// Task 13 added the `trigger` keyword coverage below alongside harness/memory/
// plugin/fallback/provider.

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

  it("accepts `memory` as a Reference first segment", async () => {
    // The canonical agent shape from spec §2.9 is `memory = memory.izsha_global`
    // — the field name `memory` and the leading Reference segment `memory`
    // both collide with the declaration keyword. With Name in place this
    // parses cleanly; without `memory` in Name's alternatives the second
    // `memory` token here would fail Reference matching.
    const project = await expectParses(`
      persona p { spine = memory.spineflow_global }
    `);
    const field = firstPersona(project).fields[0];
    expect(field.name).toBe("spine");
    expect(isReference(field.value)).toBe(true);
    if (isReference(field.value)) {
      expect(field.value.segments).toEqual(["memory", "spineflow_global"]);
    }
  });

  it("accepts `memory` as a Field name and TypeReference segment", async () => {
    // Two-axis coverage for the `memory` keyword: as a Field name (mirroring
    // the canonical agent `memory = memory.X` shape) and as a segment inside
    // a TypeReference (`x : memory.Handle = ...`).
    const project = await expectParses(`
      persona p {
        memory = memory.izsha_global
        binding : memory.Handle = "x"
      }
    `);
    const persona = firstPersona(project);
    expect(persona.fields).toHaveLength(2);
    const [memoryField, bindingField] = persona.fields;
    expect(memoryField.name).toBe("memory");
    expect(isReference(memoryField.value)).toBe(true);
    if (isReference(memoryField.value)) {
      expect(memoryField.value.segments).toEqual(["memory", "izsha_global"]);
    }
    expect(bindingField.name).toBe("binding");
    expect(bindingField.type?.$type).toBe("TypeReference");
    expect(bindingField.type?.segments).toEqual(["memory", "Handle"]);
    expect(isStringLiteral(bindingField.value)).toBe(true);
    if (isStringLiteral(bindingField.value)) {
      expect(bindingField.value.value).toBe("x");
    }
  });

  it("accepts `harness` as a Reference first segment and as a Field name", async () => {
    // The canonical agent shape from spec §2.9 is `harness = harness.asset_drain`
    // — the field name `harness` and the leading Reference segment `harness`
    // both collide with the declaration keyword. With `harness` appended to
    // Name's alternatives this parses cleanly. Mirrors the `memory` two-axis
    // coverage above.
    const project = await expectParses(`
      persona p {
        harness = harness.asset_drain
        scaffold : harness.Kind = "x"
      }
    `);
    const persona = firstPersona(project);
    expect(persona.fields).toHaveLength(2);
    const [harnessField, scaffoldField] = persona.fields;
    expect(harnessField.name).toBe("harness");
    expect(isReference(harnessField.value)).toBe(true);
    if (isReference(harnessField.value)) {
      expect(harnessField.value.segments).toEqual(["harness", "asset_drain"]);
    }
    expect(scaffoldField.name).toBe("scaffold");
    expect(scaffoldField.type?.$type).toBe("TypeReference");
    expect(scaffoldField.type?.segments).toEqual(["harness", "Kind"]);
    expect(isStringLiteral(scaffoldField.value)).toBe(true);
    if (isStringLiteral(scaffoldField.value)) {
      expect(scaffoldField.value.value).toBe("x");
    }
  });

  it("accepts `plugin` as a Reference first segment and as a Field name", async () => {
    // Task 12: `plugin` becomes a declaration keyword. The canonical agent
    // shape from spec §2.9 is `uses = [plugin.asset_pipeline]`, and §2.3
    // motivates `plugin.<name>.<tool>` as tool-reference paths. Both the
    // leading Reference segment `plugin` and the field name `plugin` (e.g.,
    // `plugin = plugin.asset_pipeline` for any plugin-binding field) must
    // parse cleanly. Mirrors the harness/memory two-axis coverage above.
    const project = await expectParses(`
      persona p {
        plugin = plugin.asset_pipeline
        tool   = plugin.asset_pipeline.list_backlog
        binding : plugin.Handle = "x"
      }
    `);
    const persona = firstPersona(project);
    expect(persona.fields).toHaveLength(3);
    const [pluginField, toolField, bindingField] = persona.fields;
    expect(pluginField.name).toBe("plugin");
    expect(isReference(pluginField.value)).toBe(true);
    if (isReference(pluginField.value)) {
      expect(pluginField.value.segments).toEqual([
        "plugin",
        "asset_pipeline",
      ]);
    }
    expect(toolField.name).toBe("tool");
    expect(isReference(toolField.value)).toBe(true);
    if (isReference(toolField.value)) {
      expect(toolField.value.segments).toEqual([
        "plugin",
        "asset_pipeline",
        "list_backlog",
      ]);
    }
    expect(bindingField.name).toBe("binding");
    expect(bindingField.type?.$type).toBe("TypeReference");
    expect(bindingField.type?.segments).toEqual(["plugin", "Handle"]);
    expect(isStringLiteral(bindingField.value)).toBe(true);
    if (isStringLiteral(bindingField.value)) {
      expect(bindingField.value.value).toBe("x");
    }
  });

  it("accepts `trigger` as a Reference first segment and as a Field name", async () => {
    // Task 13: `trigger` becomes a declaration keyword (cron + event shapes).
    // Mirror the harness/memory/plugin two-axis coverage: it must work as a
    // leading Reference segment (`hook = trigger.daily_check`), as a Field
    // name (`trigger = trigger.daily_check`), and as a TypeReference segment
    // (`schedule : trigger.Cron = "1h"`). Without `trigger` in Name's
    // alternatives any of these would fail Reference / Field-name matching.
    const project = await expectParses(`
      persona p {
        trigger = trigger.daily_check
        hook   = trigger.daily_check.payload
        schedule : trigger.Cron = "1h"
      }
    `);
    const persona = firstPersona(project);
    expect(persona.fields).toHaveLength(3);
    const [triggerField, hookField, scheduleField] = persona.fields;
    expect(triggerField.name).toBe("trigger");
    expect(isReference(triggerField.value)).toBe(true);
    if (isReference(triggerField.value)) {
      expect(triggerField.value.segments).toEqual([
        "trigger",
        "daily_check",
      ]);
    }
    expect(hookField.name).toBe("hook");
    expect(isReference(hookField.value)).toBe(true);
    if (isReference(hookField.value)) {
      expect(hookField.value.segments).toEqual([
        "trigger",
        "daily_check",
        "payload",
      ]);
    }
    expect(scheduleField.name).toBe("schedule");
    expect(scheduleField.type?.$type).toBe("TypeReference");
    expect(scheduleField.type?.segments).toEqual(["trigger", "Cron"]);
    expect(isStringLiteral(scheduleField.value)).toBe(true);
    if (isStringLiteral(scheduleField.value)) {
      expect(scheduleField.value.value).toBe("1h");
    }
  });

  it("accepts `fallback` and `provider` as Reference first segments", async () => {
    // `fallback` and `provider` are both leading-keyword declarations; they
    // must work as identifiers in Reference positions too. This covers the
    // canonical `routes = { fallback = route.cerebras }` shape and any
    // `selectedProvider = provider.cerebras_glm` reference.
    const project = await expectParses(`
      persona p {
        backup = fallback.handle_failure
        primary_provider = provider.cerebras_glm
      }
    `);
    const persona = firstPersona(project);
    expect(persona.fields).toHaveLength(2);
    const [backup, primary] = persona.fields;
    expect(isReference(backup.value)).toBe(true);
    if (isReference(backup.value)) {
      expect(backup.value.segments).toEqual(["fallback", "handle_failure"]);
    }
    expect(isReference(primary.value)).toBe(true);
    if (isReference(primary.value)) {
      expect(primary.value.segments).toEqual(["provider", "cerebras_glm"]);
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
