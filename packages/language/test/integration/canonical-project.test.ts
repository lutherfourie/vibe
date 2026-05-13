// Task 19 — integration test that runs every `.vibe` file in `examples/`
// through the parser AND the validator. This catches drift between the spec,
// the grammar, and the example files: if Task 18's authored examples ever
// stop satisfying the rules from Tasks 15–17 (or future validators), this
// suite fires immediately.
//
// Test shape mirrors the validator tests (Tasks 15 / 16 / 17): one shared
// `services` container so the parser and DocumentBuilder share document
// ownership (the singleton pattern hardened in commit 8f98c04), and a
// `diagnosticMessages` helper that returns the messages emitted for a given
// source. Each example file becomes its own `it()` so a failure points at
// the offending file by name and the message list is interpolated into the
// expect-context for fast triage.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EmptyFileSystem } from "langium";
import { parseHelper } from "langium/test";
import { describe, expect, it } from "vitest";
import type { Project } from "../../src/generated/ast.js";
import { createVibeServices } from "../../src/vibe-module.js";

const services = createVibeServices(EmptyFileSystem).Vibe;
const parse = parseHelper<Project>(services);

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(here, "../../../../examples");

async function diagnosticMessages(source: string): Promise<string[]> {
  const document = await parse(source);
  await services.shared.workspace.DocumentBuilder.build([document], {
    validation: true,
  });
  const parseMessages = document.parseResult.lexerErrors
    .concat(document.parseResult.parserErrors)
    .map((e) => `parse: ${e.message}`);
  const validationMessages = (document.diagnostics ?? [])
    .filter((d) => d.severity === 1)
    .map((d) => d.message);
  return [...parseMessages, ...validationMessages];
}

describe("examples/ integration — every .vibe parses + validates clean", () => {
  const files = readdirSync(examplesDir)
    .filter((f) => f.endsWith(".vibe"))
    .sort();

  // Guard rail: if Task 18's examples ever disappear we want a loud failure,
  // not a silent zero-test pass.
  it("examples directory contains at least the 9 canonical files", () => {
    expect(files.length, `examples found in ${examplesDir}`).toBeGreaterThanOrEqual(9);
  });

  for (const file of files) {
    it(`parses and validates ${file} with zero errors`, async () => {
      const source = readFileSync(join(examplesDir, file), "utf8");
      const messages = await diagnosticMessages(source);
      expect(
        messages,
        `${file} emitted diagnostics:\n  - ${messages.join("\n  - ")}`,
      ).toEqual([]);
    });
  }
});
