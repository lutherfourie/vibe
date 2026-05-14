import { describe, expect, it } from "vitest";
import {
  isAgent,
  isListExpression,
  isObjectExpression,
  isReference,
} from "../../src/generated/ast.js";
import { firstAgent } from "../ast-helpers.js";
import { expectParseFailure, expectParses } from "../parse-helper.js";

// Task 14: agent primitive — spec §2.9. The climax declaration that composes
// references to every other primitive (provider, persona, harness, memory,
// plugin, route, trigger). Replaces the placeholder body-less Agent rule
// with `fields+=Field*` so the body matches the canonical spec example.
//
// Required field (per spec §2.9): `uses` (list of plugin references).
// Optional fields: `persona`, `memory`, `harness`, `routes`. The grammar is
// permissive; required-field enforcement lives in the Task 15+ validators.

describe("agent primitive", () => {
  it("parses the empty agent body (Task 6.5 smoke shape still valid)", async () => {
    // The placeholder Agent rule used `'{' '}'`; the new rule uses
    // `fields+=Field*`, which still accepts zero fields. Lock this in so the
    // existing smoke test (`agent planner {}`) keeps working.
    const project = await expectParses(`
      agent planner {}
    `);
    expect(project.declarations).toHaveLength(1);
    const agent = firstAgent(project);
    expect(isAgent(agent)).toBe(true);
    expect(agent.$type).toBe("Agent");
    expect(agent.name).toBe("planner");
    expect(agent.fields).toHaveLength(0);
  });

  it("parses minimal agent with `uses` only (spec §2.9 required field)", async () => {
    const project = await expectParses(`
      agent izsha { uses = [plugin.asset_pipeline] }
    `);
    expect(project.declarations).toHaveLength(1);
    const agent = firstAgent(project);
    expect(agent.$type).toBe("Agent");
    expect(agent.name).toBe("izsha");
    expect(agent.fields).toHaveLength(1);
    const uses = agent.fields[0];
    expect(uses.name).toBe("uses");
    expect(isListExpression(uses.value)).toBe(true);
    if (isListExpression(uses.value)) {
      expect(uses.value.items).toHaveLength(1);
      const item = uses.value.items[0];
      expect(isReference(item)).toBe(true);
      if (isReference(item)) {
        expect(item.segments).toEqual(["plugin", "asset_pipeline"]);
      }
    }
  });

  it("parses the canonical spec §2.9 example — all 7 primitive references reachable from agent body", async () => {
    // This is the integration moment. The example tracks spec §2.9 and
    // composes references to provider, persona, harness, memory, plugin,
    // route, and trigger. The spec example shows newline-separated object
    // entries for readability, but the structured-region grammar (§3) requires
    // `,` between ObjectExpression entries — so we comma-separate here.
    const project = await expectParses(`
      agent izsha {
        persona  = persona.izsha_voice
        memory   = memory.izsha_global
        harness  = harness.asset_drain
        uses     = [plugin.asset_pipeline]
        provider = provider.cerebras.glm_4_7
        triggers = [trigger.heartbeat]

        routes = {
          planner   = route.planner,
          generator = route.generator,
          resolver  = route.resolver
        }
      }
    `);
    expect(project.declarations).toHaveLength(1);
    const agent = firstAgent(project);
    expect(agent.$type).toBe("Agent");
    expect(agent.name).toBe("izsha");
    expect(agent.fields).toHaveLength(7);

    const byName = new Map(agent.fields.map((f) => [f.name, f]));

    // persona reference
    const personaField = byName.get("persona");
    expect(personaField).toBeDefined();
    if (personaField && isReference(personaField.value)) {
      expect(personaField.value.segments).toEqual([
        "persona",
        "izsha_voice",
      ]);
    } else {
      throw new Error("persona field is not a Reference");
    }

    // memory reference
    const memoryField = byName.get("memory");
    expect(memoryField).toBeDefined();
    if (memoryField && isReference(memoryField.value)) {
      expect(memoryField.value.segments).toEqual([
        "memory",
        "izsha_global",
      ]);
    } else {
      throw new Error("memory field is not a Reference");
    }

    // harness reference
    const harnessField = byName.get("harness");
    expect(harnessField).toBeDefined();
    if (harnessField && isReference(harnessField.value)) {
      expect(harnessField.value.segments).toEqual([
        "harness",
        "asset_drain",
      ]);
    } else {
      throw new Error("harness field is not a Reference");
    }

    // uses = [plugin.<name>] — required list of plugin references
    const usesField = byName.get("uses");
    expect(usesField).toBeDefined();
    if (usesField && isListExpression(usesField.value)) {
      expect(usesField.value.items).toHaveLength(1);
      const item = usesField.value.items[0];
      if (isReference(item)) {
        expect(item.segments).toEqual(["plugin", "asset_pipeline"]);
      } else {
        throw new Error("uses[0] is not a Reference");
      }
    } else {
      throw new Error("uses field is not a ListExpression");
    }

    // provider reference — proves the `provider` keyword survives as a
    // qualified-name segment inside the agent body (composition with §2.6).
    const providerField = byName.get("provider");
    expect(providerField).toBeDefined();
    if (providerField && isReference(providerField.value)) {
      expect(providerField.value.segments).toEqual([
        "provider",
        "cerebras",
        "glm_4_7",
      ]);
    } else {
      throw new Error("provider field is not a Reference");
    }

    // triggers = [trigger.<name>] — proves `trigger` keyword segment survives
    // through a list expression nested in the agent body.
    const triggersField = byName.get("triggers");
    expect(triggersField).toBeDefined();
    if (triggersField && isListExpression(triggersField.value)) {
      expect(triggersField.value.items).toHaveLength(1);
      const item = triggersField.value.items[0];
      if (isReference(item)) {
        expect(item.segments).toEqual(["trigger", "heartbeat"]);
      } else {
        throw new Error("triggers[0] is not a Reference");
      }
    } else {
      throw new Error("triggers field is not a ListExpression");
    }

    // routes = { planner = route.planner, ... } — per-agent route overrides
    // (object literal with `route` keyword segment in each value).
    const routesField = byName.get("routes");
    expect(routesField).toBeDefined();
    if (routesField && isObjectExpression(routesField.value)) {
      expect(routesField.value.entries).toHaveLength(3);
      const routeMap = new Map(
        routesField.value.entries.map((e) => [e.key, e.value]),
      );
      for (const key of ["planner", "generator", "resolver"]) {
        const val = routeMap.get(key);
        if (val && isReference(val)) {
          expect(val.segments).toEqual(["route", key]);
        } else {
          throw new Error(`routes.${key} is not a Reference`);
        }
      }
    } else {
      throw new Error("routes field is not an ObjectExpression");
    }
  });

  it("parses agent with persona + memory + harness + uses", async () => {
    const project = await expectParses(`
      agent izsha {
        persona = persona.izsha_voice
        memory  = memory.izsha_global
        harness = harness.asset_drain
        uses    = [plugin.asset_pipeline]
      }
    `);
    expect(project.declarations).toHaveLength(1);
    const agent = firstAgent(project);
    expect(agent.fields).toHaveLength(4);
    expect(agent.fields.map((f) => f.name)).toEqual([
      "persona",
      "memory",
      "harness",
      "uses",
    ]);
  });

  it("parses agent with multiple plugins in `uses`", async () => {
    const project = await expectParses(`
      agent izsha {
        uses = [plugin.asset_pipeline, plugin.deploy, plugin.life]
      }
    `);
    expect(project.declarations).toHaveLength(1);
    const agent = firstAgent(project);
    expect(agent.fields).toHaveLength(1);
    const uses = agent.fields[0];
    expect(uses.name).toBe("uses");
    if (isListExpression(uses.value)) {
      expect(uses.value.items).toHaveLength(3);
      const names = uses.value.items.map((item) =>
        isReference(item) ? item.segments.join(".") : null,
      );
      expect(names).toEqual([
        "plugin.asset_pipeline",
        "plugin.deploy",
        "plugin.life",
      ]);
    } else {
      throw new Error("uses field is not a ListExpression");
    }
  });

  it("parses multiple agents in the same project", async () => {
    const project = await expectParses(`
      agent planner {}
      agent izsha { uses = [plugin.asset_pipeline] }
    `);
    expect(project.declarations).toHaveLength(2);
  });

  it("rejects an agent declaration missing the body", async () => {
    // Spec §2.9 grammar requires `{ ... }`. Bodyless declaration is malformed.
    const messages = await expectParseFailure(`
      agent izsha
    `);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects an agent declaration missing the name", async () => {
    // The Agent rule requires `name=ID` after the `agent` keyword.
    const messages = await expectParseFailure(`
      agent { uses = [plugin.asset_pipeline] }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });
});
