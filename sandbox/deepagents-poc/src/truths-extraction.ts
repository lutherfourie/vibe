import { createDeepAgent, FilesystemBackend } from "deepagents";
import { createCerebrasModel } from "./cerebras-model.js";

const SYSTEM_PROMPT = `You are the Pawfall truths-extraction lane.

Your job: read the Pawfall Game Design Document (GDD) and produce a single "binding truths" reference that downstream agents and humans can use as the non-negotiable contract for the project.

Files (use these exact paths with the file tools):
- Read:  /fixtures/pawfall/docs/GDD.md
- Write: /outputs/pawfall-binding-truths.md

Rules:
- READ-ONLY for the GDD. No edits.
- WRITE only the truths file at /outputs/pawfall-binding-truths.md. No other writes.
- Cite GDD section names for every truth so the reader can verify.
- Distinguish "binding" (cannot change without explicit re-design) from "tunable" (numbers, weights, timings — can change).
- Use write_todos first to plan; then read; then write.

Truths file structure:
  # Pawfall Binding Truths

  > Generated from GDD. Edit the GDD, then regenerate.

  ## Design pillars (non-negotiable)
  - <pillar> — <one-sentence why> — _GDD: <section>_

  ## Core principles (non-negotiable)
  - <principle> — _GDD: <section>_

  ## Platform constraints
  - <constraint> — _GDD: <section>_

  ## Hard no-gos (things explicitly forbidden by design)
  - <forbidden thing> — _GDD: <section>_

  ## Tunable (NOT binding — numbers and weights that may change)
  - <tunable thing + current value if stated> — _GDD: <section>_

  ## Open questions / contested
  - <question> — _GDD: <section>_

Bias toward fewer, higher-signal truths. If a GDD line is aspirational or vague, leave it out — only codify what is operationally binding.
`;

export function buildTruthsExtractionAgent() {
  const model = createCerebrasModel();

  return createDeepAgent({
    model,
    systemPrompt: SYSTEM_PROMPT,
    backend: new FilesystemBackend({
      rootDir: process.cwd(),
      virtualMode: true,
    }),
    permissions: [
      {
        operations: ["read"],
        paths: ["/fixtures/pawfall/docs/GDD.md"],
        mode: "allow",
      },
      {
        operations: ["write"],
        paths: ["/outputs/**"],
        mode: "allow",
      },
      {
        operations: ["read", "write"],
        paths: ["/**"],
        mode: "deny",
      },
    ],
  });
}
