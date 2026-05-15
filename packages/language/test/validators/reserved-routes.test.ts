// Task 16 — reserved route name (`resolver` required).
//
// Spec §2.2: `resolver` is the LLM-resolver sink and is REQUIRED. The plan
// pulls this through as a validator that runs over the Project root.
//
// Test shape mirrors `duplicate-declarations.test.ts`:
//
//   - One shared services container is used by both the parser and the
//     validator, so the document the validator inspects is owned by the
//     same DocumentBuilder that parsed it (the singleton pattern Task 15
//     hardened in commit 8f98c04).
//   - Diagnostics are read via the same `diagnosticMessages` helper shape,
//     and assertions filter the messages they care about so unrelated
//     future diagnostics don't make the suite brittle.
//
// Four cases cover the v0 contract:
//
//   1. Happy: resolver declared → no missing-resolver diagnostic.
//   2. Routes present, no resolver → diagnostic fires (the plan's case A).
//   3. Agents present, no routes at all → diagnostic fires. Spec §2.2 says
//      the resolver is the default sink for any LLM call; an agent without
//      any routes has no resolver path at all.
//   4. Empty / pure-noise project (no agents, no routes) → no diagnostic.
//      A .vibe file that only declares providers/personas/memory/etc. has
//      no work to route, so the missing-resolver error would be noise. The
//      duplicate-declarations tests depend on this exemption.

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

const RESOLVER_REGEX = /Missing required route `resolver`/;

describe("reserved route validator — resolver required", () => {
  it("accepts a project that declares resolver (happy path)", async () => {
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = "api" }
      route resolver -> cerebras.glm_4_7
    `);
    const resolverDiagnostics = messages.filter((m) => RESOLVER_REGEX.test(m));
    expect(resolverDiagnostics).toEqual([]);
  });

  it("reports missing resolver when routes are declared but none are `resolver`", async () => {
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = "api" }
      route planner -> cerebras.glm_4_7
    `);
    const resolverDiagnostics = messages.filter((m) => RESOLVER_REGEX.test(m));
    expect(resolverDiagnostics).toHaveLength(1);
    expect(resolverDiagnostics[0]).toMatch(/resolver/i);
    expect(resolverDiagnostics[0]).toMatch(/required/i);
  });

  it("reports missing resolver when an agent is declared but no resolver route exists", async () => {
    // Spec §2.2 frames resolver as the default sink for any LLM call; an
    // agent with no routes at all has no resolver path, which is the same
    // class of error as routes-but-no-resolver.
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = "api" }
      agent izsha { uses = [plugin.asset_pipeline] }
    `);
    const resolverDiagnostics = messages.filter((m) => RESOLVER_REGEX.test(m));
    expect(resolverDiagnostics).toHaveLength(1);
  });

  it("does NOT report missing resolver in an empty project (no agents, no routes)", async () => {
    // A file with only providers / personas / memory / harness / plugin
    // declarations has no work to route, so the missing-resolver diagnostic
    // would be noise. This exemption is what keeps the Task 15
    // duplicate-declaration tests green — they exercise persona/memory/etc.
    // duplicates in projects with no routes or agents.
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = "api" }
      persona pm { tone = "warm" }
      memory pinned { kind = "spineflow", namespace = "izsha" }
      harness ui { kind = "spineflow" }
      plugin asset_pipeline { kind = "spineflow" }
    `);
    const resolverDiagnostics = messages.filter((m) => RESOLVER_REGEX.test(m));
    expect(resolverDiagnostics).toEqual([]);
  });

  it("does NOT report missing resolver when an agent declares it alongside a non-resolver route", async () => {
    // Sanity: as long as some route is named `resolver`, the presence of
    // additional non-resolver routes (planner, generator, etc.) is fine.
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = "api" }
      provider anthropic.claude_code { mode = "cli" }
      route resolver -> cerebras.glm_4_7
      route planner -> anthropic.claude_code
      agent izsha { uses = [plugin.asset_pipeline] }
    `);
    const resolverDiagnostics = messages.filter((m) => RESOLVER_REGEX.test(m));
    expect(resolverDiagnostics).toEqual([]);
  });
});
