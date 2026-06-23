// Regression — the cross-reference validator must not throw on a partial AST.
//
// When a `provider` or `surface` block is typed mid-keystroke without its
// (qualified) name — `provider { model = "x" }` — the parser produces a
// recovered Provider/Surface node whose `name` is undefined. The
// `checkCrossReferences` populator used to dereference `decl.name.segments`
// unguarded and threw `TypeError: Cannot read properties of undefined
// (reading 'segments')`. Langium's ValidationRegistry.handleException swallows
// the throw, but the side effect is that the WHOLE document loses its
// diagnostics — an LSP authoring frontend (the gamespree Feel Compiler editor)
// would show no markers at all while the user is typing.
//
// The fix mirrors the `?.` guard already used in `declarationKey`: skip the
// populator entry when no name is bound. The parser still emits its own
// "Expecting token of type 'ID'..." diagnostic, so the malformed input is not
// hidden — it is reported, and the rest of the document's validation runs.
//
// This suite asserts both halves of the contract: (1) validation does not
// throw, and (2) the document still surfaces the parser diagnostic.

import { EmptyFileSystem } from "langium";
import { parseHelper } from "langium/test";
import { describe, expect, it } from "vitest";
import type { Project } from "../../src/generated/ast.js";
import { createVibeServices } from "../../src/vibe-module.js";

const services = createVibeServices(EmptyFileSystem).Vibe;
const parse = parseHelper<Project>(services);

async function buildAndCollect(source: string): Promise<string[]> {
  const document = await parse(source);
  // If the validator throws, Langium logs it and returns; the test asserts the
  // observable contract (diagnostics survive) rather than catching here.
  await services.shared.workspace.DocumentBuilder.build([document], {
    validation: true,
  });
  const parseMessages = document.parseResult.lexerErrors
    .concat(document.parseResult.parserErrors)
    .map((e) => e.message);
  const validationMessages = (document.diagnostics ?? [])
    .filter((d) => d.severity === 1)
    .map((d) => d.message);
  return [...parseMessages, ...validationMessages];
}

describe("cross-reference validator — partial AST does not NPE", () => {
  it("a nameless `provider { ... }` block produces diagnostics, not a crash", async () => {
    const messages = await buildAndCollect(`
      provider { model = "x" }
      route resolver -> p
    `);
    // The parser flags the missing provider name; nothing throws.
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some((m) => /Expecting token of type 'ID'/.test(m))).toBe(
      true,
    );
  });

  it("a nameless `surface { ... }` block produces diagnostics, not a crash", async () => {
    const messages = await buildAndCollect(`
      surface { mode = "x" }
    `);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some((m) => /Expecting token of type 'ID'/.test(m))).toBe(
      true,
    );
  });

  it("a well-formed provider/surface graph still validates clean (no regression)", async () => {
    const messages = await buildAndCollect(`
      provider cerebras.glm { model = "glm-4.7" }
      surface codex.local { mode = "api" }
      route resolver -> cerebras.glm
    `);
    expect(messages).toEqual([]);
  });
});
