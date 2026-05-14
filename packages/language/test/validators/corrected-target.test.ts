// Task 8 — `corrected` block target must be non-empty.
//
// Spec §SD2: `corrected for "<target>" { ... }` carries a feedback edit that
// the resolver merges back into a specific resolver invocation. The target
// string is the addressing key; an empty target has no merge destination, so
// the block is dead text. We flag it at the source level rather than letting
// the runtime silently drop it.
//
// Test shape mirrors `reserved-routes.test.ts`: one shared services container,
// `diagnosticMessages` helper that builds the document with `validation: true`,
// and string-equality / regex filtering so unrelated future diagnostics don't
// make the suite brittle.

import { EmptyFileSystem } from "langium";
import { parseHelper } from "langium/test";
import { describe, expect, it } from "vitest";
import type { Project } from "../../src/generated/ast.js";
import { createVibeServices } from "../../src/vibe-module.js";

const services = createVibeServices(EmptyFileSystem).Vibe;
const parse = parseHelper<Project>(services);

async function diagnosticMessages(source: string): Promise<string[]> {
  const document = await parse(source);
  await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
  return document.diagnostics?.map((d) => d.message) ?? [];
}

describe("corrected target validator", () => {
  it("accepts a non-empty target", async () => {
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = api }
      route resolver -> cerebras.glm_4_7
      corrected for "resolver#tag" { description = "x" }
    `);
    expect(messages.filter((m) => /target/i.test(m))).toEqual([]);
  });

  it("rejects an empty target", async () => {
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = api }
      route resolver -> cerebras.glm_4_7
      corrected for "" { description = "x" }
    `);
    expect(messages).toContain("`corrected` target must not be empty.");
  });
});
