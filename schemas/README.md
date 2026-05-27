# Vibe IR Schemas

Canonical JSON Schemas (Draft 2020-12) for the two IRs that cross the
TypeScript ↔ Go boundary. These files are the **source of truth** for shape.

## `vibe-self-plan.schema.json`

The self-plan IR.

- **Producer:** `@vibe/language` — `extractSelfPlan` (`packages/language/src/self/self-plan.ts`).
- **Emitted to:** `docs/examples/vibe-self-plan.json` via `pnpm run self:plan`.
- **Consumer:** Go `internal/selfplan` (`vibe lanes | graph | serve | continue | handoff --self-plan`).
  `vibe continue` treats a schema-invalid self-plan as non-fatal — it skips the plan
  summary but still prints the resume report, so "what next" works on a dirty repo.
- **Enforced by:** `packages/language` Vitest conformance test (producer side) and
  `internal/selfplan` Go test + runtime `Load` validation (consumer side).

## `vibe-lane-plan.schema.json`

The lane-plan IR.

- **Producer:** hand-authored or `bootstrap.SelfMakingPlan` (e.g. `docs/examples/pawfall-feedback-lanes.json`).
- **Consumer:** Go `internal/lanes` via `vibe handoff --plan` and `vibe-coord emit`.

## Rules

- Edit `examples/vibe-self.vibe`, then regenerate with `pnpm run self:plan`. CI fails
  if the committed `docs/examples/vibe-self-plan.json` drifts from a fresh regeneration.
- A new field in the producer requires updating the schema (`additionalProperties: false`
  makes this intentional, not silent).
- `pnpm run schemas:check` validates the committed fixtures against these schemas.
