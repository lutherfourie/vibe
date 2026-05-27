import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function load(relPath) {
  return JSON.parse(readFileSync(resolve(root, relPath), "utf8"));
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const SELF_PLAN_ID = "https://vibecade.dev/schemas/vibe-self-plan.schema.json";
const cases = [
  { schema: "schemas/vibe-self-plan.schema.json", fixture: "docs/examples/vibe-self-plan.json" },
  { schema: "schemas/vibe-lane-plan.schema.json", fixture: "docs/examples/pawfall-feedback-lanes.json" },
];

let failed = false;
for (const c of cases) {
  const validate = ajv.compile(load(c.schema));
  if (validate(load(c.fixture))) {
    console.log(`ok: ${c.fixture} satisfies ${c.schema}`);
  } else {
    failed = true;
    console.error(`FAIL: ${c.fixture} violates ${c.schema}`);
    console.error(validate.errors);
  }
}

// Negative self-test: the self-plan schema must reject a plan missing `name`.
// Reuse the already-compiled validator (compiling again with the same $id throws).
const selfValidate = ajv.getSchema(SELF_PLAN_ID);
const missingName = { source: "x", providers: [], routes: {}, surfaces: [], agents: [], lanes: [], gates: [], notes: [] };
if (selfValidate(missingName)) {
  failed = true;
  console.error("FAIL: self-plan schema accepted an object missing `name`");
} else {
  console.log("ok: self-plan schema rejects a plan missing `name`");
}

if (failed) process.exit(1);
console.log("all schema checks passed");
