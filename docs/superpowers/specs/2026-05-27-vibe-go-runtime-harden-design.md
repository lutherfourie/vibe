# Vibe Go Runtime — Verify & Harden Design

**Status:** Approved design (brainstorming output).
**Date:** 2026-05-27
**Owner:** Luther
**Next step:** `superpowered-teams:writing-plans-for-teams` (team-format plan).

## Goal

Turn the existing Go runtime (`go/`) into a **verified, regression-guarded base**:
green CI, an enforced TS↔Go IR contract via JSON Schema, and honest docs — without
adding runtime features or refactoring production code. Valid inputs behave
identically; the only intentional behavior change is that malformed plans now fail
fast instead of silently degrading (a hardening, not a regression).

This phase precedes any "gophers" colony / world-signal / live-execution work. Its
entire purpose is to make the current substrate trustworthy before extending it.

## Context (current state, verified 2026-05-27)

- Go **is** installed: `go1.26.3 windows/amd64` (GOROOT `C:\Program Files\Go`). The
  `go/README.md` claim that "Go is not installed … checked in as source only" is
  **stale**.
- `go build ./...`, `go vet ./...`, and `go test ./...` all pass today (exit 0). The
  committed runtime is already green; nothing locks that in.
- There is **no CI** (`.github/workflows/` does not exist).
- The TS↔Go self-plan contract diverges silently: the Go `selfplan.Plan` struct
  (`go/internal/selfplan/selfplan.go`) deserializes only
  `name/source/repo/surfaces/lanes/gates` and drops `providers`, `routes`,
  `fallback`, `agents`, `notes`, and every `metadata` block that the TS producer
  (`packages/language/src/self/self-plan.ts`, interface `VibeSelfPlan`) emits.
  Nothing enforces that even the fields Go *does* read stay aligned — a TS rename
  would produce broken handoffs with no error and no failing test.

## Non-goals

- No new runtime features (no colony, world signals, or live lane execution).
- No unifying or refactoring of the two IRs (that was the rejected "Scope C").
- No parser / `packages/language` grammar changes.
- No refactor of existing `cmd/vibe` subcommands; we add validation, tests, CI, and
  docs *around* them. Happy-path output is unchanged.

## The two contracts being hardened

1. **Self-plan IR** — cross-language, primary.
   `examples/vibe-self.vibe`
   → `[TS] extractSelfPlan` (`packages/language/src/self/self-plan.ts`)
   → `docs/examples/vibe-self-plan.json`
   → `[Go] selfplan.Plan` (`go/internal/selfplan/selfplan.go`), consumed by
     `cmd/vibe lanes | graph | serve | continue`.

2. **Lane-plan IR** — Go-internal producer + consumer.
   Hand-authored / `bootstrap.SelfMakingPlan`
   → JSON (e.g. `docs/examples/pawfall-feedback-lanes.json`)
   → `[Go] lanes.Plan` (`go/internal/lanes/types.go`), consumed by
     `cmd/vibe handoff --plan` and `cmd/vibe-coord`.

## Components / deliverables

### 1. Canonical JSON Schemas (single source of truth)

New repo-root `schemas/` directory (language-neutral; reachable by both pnpm and Go):

- `schemas/vibe-self-plan.schema.json` — Draft 2020-12. Models the **full** self-plan
  shape that TS emits: `name`, `source`, `repo`, `providers[]`, `routes`, `fallback`,
  `surfaces[]`, `agents[]`, `lanes[]`, `gates[]`, `notes[]`, and the per-entity
  `metadata` objects. The fields Go consumes are marked `required`:
  - top level: `name`
  - each lane / gate: `name`
  This makes TS conformance total while contractually pinning the fields Go relies on.
- `schemas/vibe-lane-plan.schema.json` — the `lanes.Plan` shape: `name` (required),
  `repo` (required), `lanes[]` with `name` (required) and `mode` (required, enum
  `["codex.web", "local"]` — a new mode requires updating both the schema and
  `emitLane`), plus optional `branch`, `reads`, `writes`, `prompt`, `requires`.

Authoring: hand-written canonical `.json` (true to "JSON Schema as source of truth").
TS and Go both validate against the *same artifact*, not parallel re-definitions.

### 2. TS-side validation (`@vibe/language`)

- Add `ajv` (and `ajv-formats` if needed) as a devDependency.
- New Vitest test: run `extractSelfPlan` on `examples/vibe-self.vibe` and the
  `test/fixtures/shapes/*.vibe`, then assert each emitted object validates against
  `schemas/vibe-self-plan.schema.json`. Guarantees "TS emits conforming JSON."

### 3. Go-side validation (`internal/selfplan`, `internal/lanes`)

- Add a pure-Go JSON-Schema lib (`github.com/santhosh-tekuri/jsonschema/v6` — no cgo).
- `selfplan.Parse` / `selfplan.Load` validate the input against
  `vibe-self-plan.schema.json` and **fail fast** with a path+reason error on violation.
- Add a validating parse entrypoint to `internal/lanes` (today `cmd/vibe handoff --plan`
  unmarshals inline) that validates against `vibe-lane-plan.schema.json`, and route both
  `cmd/vibe handoff --plan` and `cmd/vibe-coord` through it.
- (Today these paths silently produce empty/broken output on malformed input.)
- Tests: committed fixtures (`vibe-self-plan.json`, `pawfall-feedback-lanes.json`)
  validate; a deliberately-broken inline fixture is rejected with a clear error.

### 4. CI — `.github/workflows/ci.yml`

Triggers: `push` and `pull_request`.

- **Go job** (working dir `go/`): `go build ./...`, `go vet ./...`,
  `gofmt -l .` (fail if any file is listed), `go test ./...`.
- **Node job**: setup-node 22 + pnpm 10.33.4, `pnpm install --frozen-lockfile`,
  `pnpm run check` (= `self:plan` + `pnpm -r test` + `pnpm -r build`). Confirmed
  CI-safe: the vscode-extension test is plain `vitest run` with no VS Code download.
- **Contract drift guard** (in the Node job, after `self:plan`):
  `git diff --exit-code -- docs/examples/vibe-self-plan.json` — fails if regenerating
  the self-plan changed the committed file.

### 5. CLI smoke tests (Go)

Extend `go/cmd/vibe/main_test.go` with table-driven tests asserting exit-zero and basic
output shape for `lanes`, `graph`, `handoff --self-plan`, `handoff --plan`,
`doctor --json`, `continue --json`, and `make-plan`, run against the committed fixtures
with outputs directed to a temp dir. Covers the CLI wiring, not just `internal/`.

### 6. Honest docs + contract doc

- `go/README.md`: remove the false "Go is not installed / source-only" text; document
  that it builds and tests under Go 1.26 and is gated by CI; keep the command list.
- `docs/superpowers/plans/2026-05-15-vibe-go-runtime-spike.md`: add a superseding note
  to its "Verification" section pointing at this hardening work (do not rewrite history).
- New `schemas/README.md`: describe both IRs, the canonical schema files, the
  source-of-truth rule ("edit `examples/vibe-self.vibe` → regenerate with
  `pnpm run self:plan`; the schema is the authority for shape"), and the drift guard.

## Data flow (after hardening)

```text
examples/vibe-self.vibe
  └─[TS] extractSelfPlan ──► validate vs schemas/vibe-self-plan.schema.json (Vitest + CI)
                          └─► write docs/examples/vibe-self-plan.json ──► CI drift guard (no git diff)
  └─[Go] selfplan.Load(json) ──► validate vs schema (fail-fast) ──► lanes / graph / serve / continue

hand-authored lane-plan.json
  └─[Go] lanes.Plan parse ──► validate vs schemas/vibe-lane-plan.schema.json (fail-fast) ──► handoff
```

## Testing strategy

- TS: Vitest schema-conformance test on the emitted self-plan.
- Go: schema-validation unit tests (good fixtures pass, broken fixture rejected) +
  the CLI smoke tests; all existing `internal/` tests remain green.
- CI: Go (build/vet/gofmt/test) + Node (`pnpm run check`) + drift guard on every
  push/PR.

## Error handling

- Go `Load`/`Parse` returns a descriptive schema-violation error (JSON pointer + reason
  from the jsonschema lib) instead of silently empty output.
- CI fails loudly on: build/vet/test failure, unformatted Go, schema violation, or
  self-plan drift.

## Resolved defaults

- **Schema placement**: repo-root `schemas/`; Go **loads schemas at runtime** via its
  existing repo-root path resolution (`repoRoot()` in `cmd/vibe`, which walks up to
  `pnpm-workspace.yaml`). Single neutral source, no copies, consistent with how Go
  already resolves the plan file. If a portable standalone binary is ever needed, move
  the schemas under `go/` and `//go:embed` them — deferred, since the runtime is
  local-first.
- **CI OS**: `ubuntu-latest` for both jobs. A `windows-latest` Go job can be added to
  the matrix later (the runtime is Windows-first), but Go/Node are cross-platform and
  the fixtures are plain strings, so ubuntu is sufficient to start.

## Team-fitness preview

Natural specialist split for the team plan:

- **TS/language** — author the canonical schemas (shared artifact) + TS validation test.
- **Go/runtime** — Go schema validation + fail-fast + CLI smoke tests + gofmt cleanliness.
- **CI/devops** — the GitHub Actions workflow + drift guard.
- **docs** — `go/README.md`, spike-plan note, `schemas/README.md`.

The canonical schema is a Wave-1 shared artifact that **blocks** both the TS-validate and
Go-validate tasks, yielding a clean wave structure (Wave 1: author schemas + CI skeleton +
docs scaffold; Wave 2: both-side validation against the schema + smoke tests + drift-guard
wiring). `writing-plans-for-teams` will run its own fitness check to confirm team execution
fits.
