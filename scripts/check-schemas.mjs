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
  { schema: "schemas/vibe-lane-plan.schema.json", fixture: "docs/examples/vibe-autonomous-lanes.json" },
];

// Compile each distinct schema at most once: ajv throws if the same $id is
// registered twice, so fixtures that share a schema reuse the compiled validator.
function validatorFor(relSchemaPath) {
  const schema = load(relSchemaPath);
  return ajv.getSchema(schema.$id) ?? ajv.compile(schema);
}

let failed = false;
for (const c of cases) {
  const validate = validatorFor(c.schema);
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
  console.error("FAIL: lane-plan schema accepted a lane with mode outside [codex.web, local, autonomous]");
} else {
  console.log("ok: lane-plan schema rejects a lane with an out-of-enum mode");
}

// Negative lane-plan test: the namespaced `autonomous` object is closed
// (additionalProperties:false), so an unknown key must be rejected — this is the
// guardrail that keeps the schema and the Go `Autonomous` struct in lockstep.
const badAutonomousKey = {
  name: "p",
  repo: "C:/x",
  lanes: [{ name: "l", mode: "autonomous", autonomous: { progress: "PROGRESS.md", bogus: true } }],
};
if (laneValidate(badAutonomousKey)) {
  failed = true;
  console.error("FAIL: lane-plan schema accepted an unknown key inside `autonomous`");
} else {
  console.log("ok: lane-plan schema rejects an unknown key inside `autonomous`");
}

if (failed) process.exit(1);
console.log("all schema checks passed");
