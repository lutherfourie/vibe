import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import { beforeAll, describe, expect, it } from "vitest";
import { extractSelfPlanFromSource } from "../src/self/self-plan.js";

// test/self-plan-schema.test.ts -> packages/language/test -> ../../.. = repo root (C:\vibe).
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const schemaPath = resolve(repoRoot, "schemas/vibe-self-plan.schema.json");
const committedPlanPath = resolve(repoRoot, "docs/examples/vibe-self-plan.json");
const selfSourcePath = resolve(repoRoot, "examples/vibe-self.vibe");

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("self-plan schema conformance", () => {
  let validate: ValidateFunction;

  beforeAll(() => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    validate = ajv.compile(loadJson(schemaPath));
  });

  it("extractSelfPlanFromSource emits a schema-conformant plan", async () => {
    const source = await readFile(selfSourcePath, "utf8");
    const plan = await extractSelfPlanFromSource(source, {
      sourceName: "examples/vibe-self.vibe",
      uri: pathToFileURL(selfSourcePath).href,
    });

    // Round-trip through JSON so the asserted value matches what the runtime consumes.
    const valid = validate(JSON.parse(JSON.stringify(plan)));
    if (!valid) {
      // Surface ajv's errors so a real drift is debuggable, not just "expected true".
      console.error(validate.errors);
    }
    expect(valid).toBe(true);
  });

  it("the committed docs/examples/vibe-self-plan.json conforms", () => {
    const valid = validate(loadJson(committedPlanPath));
    if (!valid) {
      console.error(validate.errors);
    }
    expect(valid).toBe(true);
  });

  it("rejects a plan missing a required field (`name`)", () => {
    const plan = loadJson(committedPlanPath) as Record<string, unknown>;
    // Start from a known-valid plan and remove exactly one required field, so a
    // rejection is attributable to the missing `name` rather than other noise.
    delete plan.name;

    const valid = validate(plan);
    expect(valid).toBe(false);
    expect(validate.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: "required",
          params: { missingProperty: "name" },
        }),
      ]),
    );
  });
});
