// Task 17 — cross-reference resolution validator.
//
// Spec §2 frames every primitive as a top-level declaration whose dotted-id
// handle (e.g. `plugin.asset_pipeline`, `persona.izsha_voice`) is the
// reference path other declarations use to wire to it. The most common
// authoring error is a typo or forgotten declaration: `uses = [plugin.foo]`
// when no `plugin foo { ... }` block exists, `harness = harness.bar` when
// `bar` was never declared, etc. The runtime catches this lazily; the
// validator catches it at edit time.
//
// Rule, in one sentence: for every `Reference` AST node anywhere in the
// project, if the FIRST segment is one of the nine declaration-kind keywords
// (`agent`, `route`, `persona`, `memory`, `harness`, `plugin`, `provider`,
// `trigger`, `fallback`), then the SECOND segment must match a declared name
// of that kind. Otherwise emit a diagnostic.
//
// Two important non-cases:
//
//   1. Bare-identifier references whose first segment ISN'T a kind keyword:
//      `persona p { pushback = high }` — `high` is a Reference (because the
//      grammar treats bare identifiers as references at expression position),
//      but `high` is not a kind keyword, so we skip it. Likewise `mode = api`
//      and any other enum-ish value. The validator is not an enum checker.
//
//   2. Three-segment `plugin.<name>.<tool>` references: spec §2.4 says tools
//      live inside the TS plugin module and are a RUNTIME concern. At v0 we
//      validate only that the plugin name resolves; the tool segment is
//      unchecked (and may not even be statically knowable without importing
//      the TS module).
//
// Provider names are dotted (e.g. `cerebras.glm_4_7`), so the declared-name
// set for providers stores the joined segments. Every other kind binds a
// single ID so a plain `name` field is the key.
//
// Test shape mirrors Task 15 / Task 16: one shared services container so the
// parser and DocumentBuilder share document ownership (the singleton pattern
// hardened in commit 8f98c04). Tests filter messages to the diagnostics this
// validator owns so adding future checks won't make this suite brittle.

import { EmptyFileSystem } from "langium";
import { parseHelper } from "langium/test";
import { describe, expect, it } from "vitest";
import type { Project } from "../../src/generated/ast.js";
import { createVibeServices } from "../../src/vibe-module.js";

const services = createVibeServices(EmptyFileSystem).Vibe;
const parse = parseHelper<Project>(services);

async function diagnosticMessages(source: string): Promise<string[]> {
  const document = await parse(source);
  await services.shared.workspace.DocumentBuilder.build([document], {
    validation: true,
  });
  return document.diagnostics?.map((d) => d.message) ?? [];
}

const UNKNOWN_REF_REGEX = /^Unknown \w+ reference: /;

describe("cross-reference validator — declared names must resolve", () => {
  it("accepts a fully-resolved reference graph (happy path)", async () => {
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = api }
      route resolver -> cerebras.glm_4_7

      plugin asset_pipeline { impl = "./plugins/asset-pipeline/index.ts" }
      persona izsha_voice { description = "coordinator, dry" }
      memory izsha_global { kind = spineflow, namespace = "izsha.global" }
      harness asset_drain { kind = planner_generator_evaluator }

      agent izsha {
        persona = persona.izsha_voice
        memory  = memory.izsha_global
        harness = harness.asset_drain
        uses    = [plugin.asset_pipeline]
      }
    `);
    const unknown = messages.filter((m) => UNKNOWN_REF_REGEX.test(m));
    expect(unknown).toEqual([]);
  });

  it("reports an unknown plugin reference inside an agent's `uses` list", async () => {
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = api }
      route resolver -> cerebras.glm_4_7
      plugin asset_pipeline { impl = "./plugins/asset-pipeline/index.ts" }

      agent izsha {
        uses = [plugin.asset_pipeline, plugin.missing_plugin]
      }
    `);
    const unknown = messages.filter((m) => UNKNOWN_REF_REGEX.test(m));
    expect(unknown).toEqual([
      "Unknown plugin reference: missing_plugin",
    ]);
  });

  it("reports an unknown persona reference", async () => {
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = api }
      route resolver -> cerebras.glm_4_7
      plugin p { impl = "./p.ts" }

      agent izsha {
        persona = persona.ghost_voice
        uses    = [plugin.p]
      }
    `);
    const unknown = messages.filter((m) => UNKNOWN_REF_REGEX.test(m));
    expect(unknown).toEqual([
      "Unknown persona reference: ghost_voice",
    ]);
  });

  it("reports an unknown harness reference", async () => {
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = api }
      route resolver -> cerebras.glm_4_7
      plugin p { impl = "./p.ts" }

      agent izsha {
        harness = harness.does_not_exist
        uses    = [plugin.p]
      }
    `);
    const unknown = messages.filter((m) => UNKNOWN_REF_REGEX.test(m));
    expect(unknown).toEqual([
      "Unknown harness reference: does_not_exist",
    ]);
  });

  it("reports an unknown memory reference", async () => {
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = api }
      route resolver -> cerebras.glm_4_7
      plugin p { impl = "./p.ts" }

      agent izsha {
        memory = memory.never_declared
        uses   = [plugin.p]
      }
    `);
    const unknown = messages.filter((m) => UNKNOWN_REF_REGEX.test(m));
    expect(unknown).toEqual([
      "Unknown memory reference: never_declared",
    ]);
  });

  it("reports an unknown provider reference (dotted-segment second part)", async () => {
    // Provider names are dotted, so the declared-name set holds the joined
    // dotted id (e.g. `cerebras.glm_4_7`). The cross-ref check joins
    // ref.segments.slice(1) before lookup so a reference `provider.nope`
    // tries to find `nope` and correctly misses.
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = api }
      route resolver -> cerebras.glm_4_7
      plugin p { impl = "./p.ts" }

      agent izsha {
        notes = provider.nope
        uses  = [plugin.p]
      }
    `);
    const unknown = messages.filter((m) => UNKNOWN_REF_REGEX.test(m));
    expect(unknown).toEqual([
      "Unknown provider reference: nope",
    ]);
  });

  it("accepts a fully-qualified dotted provider reference", async () => {
    // `provider.cerebras.glm_4_7` must resolve to the declared
    // `provider cerebras.glm_4_7` — segments after the head are joined for
    // the lookup. Regression test for a bug where only segments[1] was
    // checked, which would have false-positived as "Unknown provider
    // reference: cerebras".
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = api }
      provider openai.gpt_5    { mode = api }
      route resolver -> cerebras.glm_4_7
      plugin p { impl = "./p.ts" }

      agent izsha {
        primary  = provider.cerebras.glm_4_7
        fallback = provider.openai.gpt_5
        uses     = [plugin.p]
      }
    `);
    const unknown = messages.filter((m) => UNKNOWN_REF_REGEX.test(m));
    expect(unknown).toEqual([]);
  });

  it("flags an unknown dotted provider tail", async () => {
    // The vendor (`cerebras`) matches a declared provider's first segment,
    // but the model tail (`mystery`) does not — the joined `cerebras.mystery`
    // is not in the declared set, so the diagnostic should fire on the full
    // joined tail.
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = api }
      route resolver -> cerebras.glm_4_7
      plugin p { impl = "./p.ts" }

      agent izsha {
        primary = provider.cerebras.mystery
        uses    = [plugin.p]
      }
    `);
    const unknown = messages.filter((m) => UNKNOWN_REF_REGEX.test(m));
    expect(unknown).toEqual([
      "Unknown provider reference: cerebras.mystery",
    ]);
  });

  it("reports an unknown harness reference declared in agent field (negative path)", async () => {
    // Negative path complement to the harness happy case: same agent shape,
    // same plugin reachable, only harness name is wrong. Demonstrates each
    // mis-referenced kind fires independently and other diagnostics stay
    // quiet.
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = api }
      route resolver -> cerebras.glm_4_7

      plugin asset_pipeline { impl = "./plugins/asset-pipeline/index.ts" }
      persona izsha_voice { description = "x" }
      memory  izsha_global { kind = spineflow, namespace = "izsha" }
      harness asset_drain { kind = planner_generator_evaluator }

      agent izsha {
        persona = persona.izsha_voice
        memory  = memory.izsha_global
        harness = harness.typo_here
        uses    = [plugin.asset_pipeline]
      }
    `);
    const unknown = messages.filter((m) => UNKNOWN_REF_REGEX.test(m));
    expect(unknown).toEqual([
      "Unknown harness reference: typo_here",
    ]);
  });

  it("does NOT fire on bare-identifier references that are not kind keywords", async () => {
    // `pushback = high` — `high` is a Reference AST node (bare-id at
    // expression position), but its first segment is `high`, not one of
    // the nine kind keywords. We must skip it. Same for `mode = api` and
    // `kind = spineflow` and `lifecycle = long_lived` etc.
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 {
        mode      = api
        lifecycle = long_lived
      }
      route resolver -> cerebras.glm_4_7

      persona izsha_voice {
        description = "x"
        pushback    = high
        uncertainty = explicit
        verbosity   = terse
      }

      memory izsha_global {
        kind          = spineflow
        namespace     = "izsha"
        fog_threshold = medium
      }
    `);
    const unknown = messages.filter((m) => UNKNOWN_REF_REGEX.test(m));
    expect(unknown).toEqual([]);
  });

  it("does NOT validate the tool segment of `plugin.X.tool` (3-segment references)", async () => {
    // Spec §2.4 says tools live inside the TS plugin module and are a
    // runtime concern. So given `plugin asset_pipeline { ... }` declared,
    // `plugin.asset_pipeline.anything_at_all` must validate cleanly — we
    // only check segment[1] (the plugin name).
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = api }
      route resolver -> cerebras.glm_4_7

      plugin asset_pipeline { impl = "./plugins/asset-pipeline/index.ts" }

      trigger every "1h" {
        do = plugin.asset_pipeline.totally_made_up_tool_name
      }

      trigger on "asset_pipeline.promoted" {
        do = plugin.asset_pipeline.another_unchecked_tool
      }
    `);
    const unknown = messages.filter((m) => UNKNOWN_REF_REGEX.test(m));
    expect(unknown).toEqual([]);
  });

  it("DOES still validate the plugin segment of `plugin.X.tool` (unknown plugin name)", async () => {
    // Complement of the above: if the plugin name itself is unknown, we
    // do flag it — the tool segment being unchecked doesn't mean the
    // plugin segment is.
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = api }
      route resolver -> cerebras.glm_4_7
      plugin asset_pipeline { impl = "./p.ts" }

      trigger every "1h" {
        do = plugin.ghost_plugin.some_tool
      }
    `);
    const unknown = messages.filter((m) => UNKNOWN_REF_REGEX.test(m));
    expect(unknown).toEqual([
      "Unknown plugin reference: ghost_plugin",
    ]);
  });

  it("validates references in trigger fields and fallback to the same rule", async () => {
    // References can appear anywhere — including inside trigger field
    // expressions. Walker must visit all expression descendants of every
    // declaration, not just agents.
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = api }
      route resolver -> cerebras.glm_4_7
      plugin real_plugin { impl = "./r.ts" }

      trigger every "1h" {
        do = plugin.missing_plugin_in_trigger.health_check
      }
    `);
    const unknown = messages.filter((m) => UNKNOWN_REF_REGEX.test(m));
    expect(unknown).toEqual([
      "Unknown plugin reference: missing_plugin_in_trigger",
    ]);
  });
});
