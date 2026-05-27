import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function load(relPath) {
  return JSON.parse(readFileSync(resolve(root, relPath), "utf8"));
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
const selfPlanSchema = load("schemas/vibe-self-plan.schema.json");
const lanePlanSchema = load("schemas/vibe-lane-plan.schema.json");
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

// Reuse the already-compiled validators (compiling again with the same $id throws).
// Derive each $id from its loaded schema so the negative tests can't drift from the schema files.
function getValidator(schema) {
  const validate = ajv.getSchema(schema.$id);
  if (typeof validate !== "function") {
    throw new Error(`could not resolve compiled validator for $id ${schema.$id}`);
  }
  return validate;
}

// Negative self-test: the self-plan schema must reject a plan missing `name`.
const selfValidate = getValidator(selfPlanSchema);
const missingName = { source: "x", providers: [], routes: {}, surfaces: [], agents: [], lanes: [], gates: [], notes: [] };
if (selfValidate(missingName)) {
  failed = true;
  console.error("FAIL: self-plan schema accepted an object missing `name`");
} else {
  console.log("ok: self-plan schema rejects a plan missing `name`");
}

// Negative lane-plan test: the lane-plan schema must reject a lane with a mode outside the enum.
const laneValidate = getValidator(lanePlanSchema);
const badMode = { name: "p", repo: "C:/x", lanes: [{ name: "l", mode: "github" }] };
if (laneValidate(badMode)) {
  failed = true;
  console.error("FAIL: lane-plan schema accepted a lane with mode outside [codex.web, local]");
} else {
  console.log("ok: lane-plan schema rejects a lane with an out-of-enum mode");
}

if (failed) process.exit(1);
console.log("all schema checks passed");
