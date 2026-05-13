// Task 15 — name policy validator.
//
// Two concerns live here, both gated on "what name can a declaration bind?":
//
//   1. Duplicate declaration names (validator-level diagnostic): two `agent
//      foo` blocks, two `provider cerebras.glm_4_7` blocks, two `route
//      resolver -> X`, etc. The parser happily builds both AST nodes; the
//      validator rejects after the fact.
//
//   2. Reserved literal-word names (parser-level rejection): `agent true {}`,
//      `route null -> worker`, `persona false { ... }`. The grammar binds
//      `name=ID` for declaration headers, and `true`/`false`/`null` are
//      lexed as their literal keywords — not `ID` — so the parser refuses
//      them before any AST node with that name exists. Asserting the
//      rejection here keeps the contract visible alongside the duplicate
//      checks; a future grammar change that loosens `name=ID` would surface
//      as a test break and signal that the validator needs to take over.
//
// Grammar reference: `Name returns string` in `vibe.langium` documents the
// split — structural keywords (`agent`, `route`, …) are allowed as field
// names / object keys via `Name`, but declaration headers stay on `ID`
// specifically so this validator can hold the line on duplicates without
// also having to relitigate the keyword set.

import { EmptyFileSystem } from "langium";
import { describe, expect, it } from "vitest";
import { createVibeServices } from "../../src/vibe-module.js";
import { expectParseFailure, parseVibe } from "../parse-helper.js";

async function diagnosticMessages(source: string): Promise<string[]> {
  const services = createVibeServices(EmptyFileSystem).Vibe;
  const document = await parseVibe(source);
  await services.shared.workspace.DocumentBuilder.build([document], {
    validation: true,
  });
  return document.diagnostics?.map((d) => d.message) ?? [];
}

describe("name policy validator — duplicate declarations", () => {
  it("accepts a project with no name collisions (happy path)", async () => {
    const messages = await diagnosticMessages(`
      agent planner { uses = [plugin.x] }
      agent worker { uses = [plugin.y] }
      provider cerebras.glm_4_7 { mode = "api" }
      provider openai.gpt_5 { mode = "api" }
      persona pm { tone = "warm" }
      memory pinned { kind = "spineflow", namespace = "izsha" }
      harness ui { kind = "spineflow" }
      plugin asset_pipeline { kind = "spineflow" }
      route resolver -> planner
      route review -> worker
    `);
    // No name-policy diagnostics — there may be unrelated diagnostics in
    // future tasks, so filter for the ones this validator owns.
    const dupes = messages.filter((m) => /^Duplicate /.test(m));
    expect(dupes).toEqual([]);
  });

  it("reports two agents with the same name (same-kind duplicate)", async () => {
    const messages = await diagnosticMessages(`
      agent izsha { uses = [plugin.x] }
      agent izsha { uses = [plugin.y] }
    `);
    const dupes = messages.filter((m) => /^Duplicate /.test(m));
    expect(dupes).toEqual([
      "Duplicate agent declaration: izsha",
      "Duplicate agent declaration: izsha",
    ]);
  });

  it("reports two providers with the same qualified name", async () => {
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = "api" }
      provider cerebras.glm_4_7 { mode = "api" }
    `);
    const dupes = messages.filter((m) => /^Duplicate /.test(m));
    expect(dupes).toEqual([
      "Duplicate provider declaration: cerebras.glm_4_7",
      "Duplicate provider declaration: cerebras.glm_4_7",
    ]);
  });

  it("reports two routes that bind the same logical name", async () => {
    // Spec §2.2 reserves `route resolver -> X`; declaring it twice means the
    // engine has two competing resolvers, which is the same class of error
    // as two agents named the same thing.
    const messages = await diagnosticMessages(`
      route resolver -> planner
      route resolver -> worker
    `);
    const dupes = messages.filter((m) => /^Duplicate /.test(m));
    expect(dupes).toEqual([
      "Duplicate route declaration: resolver",
      "Duplicate route declaration: resolver",
    ]);
  });

  it("reports duplicates across every named primitive (persona/memory/harness/plugin)", async () => {
    // The plan says "Same for two providers, two routes for the same logical
    // name, etc." — the etc. covers every primitive that binds a name.
    // Trigger and Fallback have no `name=ID` slot so they're not in scope.
    const messages = await diagnosticMessages(`
      persona pm { tone = "warm" }
      persona pm { tone = "stern" }
      memory pinned { kind = "spineflow", namespace = "izsha" }
      memory pinned { kind = "spineflow", namespace = "izsha" }
      harness ui { kind = "spineflow" }
      harness ui { kind = "spineflow" }
      plugin asset_pipeline { kind = "spineflow" }
      plugin asset_pipeline { kind = "spineflow" }
    `);
    const dupes = messages.filter((m) => /^Duplicate /.test(m));
    expect(dupes).toContain("Duplicate persona declaration: pm");
    expect(dupes).toContain("Duplicate memory declaration: pinned");
    expect(dupes).toContain("Duplicate harness declaration: ui");
    expect(dupes).toContain("Duplicate plugin declaration: asset_pipeline");
    // Each duplicate fires once per offending node — 2 of each kind here.
    expect(dupes).toHaveLength(8);
  });

  it("does not flag two routes with different names", async () => {
    const messages = await diagnosticMessages(`
      route resolver -> planner
      route review -> worker
    `);
    const dupes = messages.filter((m) => /^Duplicate /.test(m));
    expect(dupes).toEqual([]);
  });
});

describe("name policy validator — reserved literal-word names", () => {
  // These cases are rejected at parse time: `true`, `false`, `null` are
  // literal keywords, not `ID`. The validator never sees them because the
  // AST node has no name. We assert that the rejection still happens, so the
  // contract stays visible regardless of which layer enforces it.

  it("rejects `agent true {}` (true is a boolean literal, not an identifier)", async () => {
    const errors = await expectParseFailure(`agent true {}`);
    expect(errors.some((m) => /'ID'.*`true`/i.test(m))).toBe(true);
  });

  it("rejects `route true -> worker`", async () => {
    const errors = await expectParseFailure(`route true -> worker`);
    expect(errors.some((m) => /'ID'.*`true`/i.test(m))).toBe(true);
  });

  it("rejects `persona false { tone = \"x\" }`", async () => {
    const errors = await expectParseFailure(`persona false { tone = "x" }`);
    expect(errors.some((m) => /'ID'.*`false`/i.test(m))).toBe(true);
  });

  it("rejects `memory null { kind = \"spineflow\", namespace = \"x\" }`", async () => {
    const errors = await expectParseFailure(
      `memory null { kind = "spineflow", namespace = "x" }`,
    );
    expect(errors.some((m) => /'ID'.*`null`/i.test(m))).toBe(true);
  });
});
