# Vibe Go Runtime Verify & Harden Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use agent-team-driven-development to implement this plan in parallel with a specialist team. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Vibe Go runtime a verified, regression-guarded base by adding a JSON-Schema-enforced TS↔Go IR contract, CI, CLI smoke tests, and honest docs — without adding runtime features or refactoring production code.

**Architecture:** Two canonical JSON Schemas in repo-root `schemas/` become the source of truth for the self-plan IR (TS `@vibe/language` emits → Go `internal/selfplan` consumes) and the lane-plan IR (Go `internal/lanes` consumes). The TS side validates its emitted plan against the schema with ajv; the Go side validates loaded plans via a new `internal/contract` package (santhosh-tekuri/jsonschema) and fails fast on violation. A GitHub Actions workflow gates Go (build/vet/gofmt/test) and the pnpm workspaces (`check` + schema conformance + a self-plan drift guard).

**Tech Stack:** Go 1.22 (`go/go.mod`), `github.com/santhosh-tekuri/jsonschema/v5`; pnpm 10 workspaces, TypeScript, Vitest, `ajv@8` (Draft 2020-12); GitHub Actions.

---

## Wave Analysis

### Specialists

| Role | Expertise | Tasks |
|------|-----------|-------|
| ts-engineer | JSON Schema authoring, TypeScript, Vitest, ajv, pnpm scripts | Tasks 1, 4 |
| go-engineer | Go, table-driven tests, `cmd/vibe` CLI, jsonschema validation | Tasks 3, 5, 6 |
| devops-engineer | GitHub Actions, pnpm/Go CI, drift guards | Task 2 |

### Waves

**Wave 1: Foundations** — the shared schema artifact + independent CLI hardening
- Task 1 (ts-engineer) — canonical JSON Schemas + `schemas:check` script
- Task 3 (go-engineer) — CLI smoke tests + honest Go docs

  *Parallel-safe because:* Task 1 touches `schemas/`, `scripts/`, root `package.json`; Task 3 touches `go/cmd/vibe/main_test.go`, `go/README.md`, the spike plan doc. No file overlap, no import relationship.

**Wave 2: Validation + CI** — all consume Wave 1's schemas
- Task 2 (devops-engineer) — GitHub Actions CI
- Task 4 (ts-engineer) — TS conformance test
- Task 5 (go-engineer) — Go `Load` validation + `internal/contract`

  *Parallel-safe because:* Task 2 touches `.github/workflows/`, Task 4 touches `packages/language/`, Task 5 touches `go/internal/{contract,selfplan}` + `go/go.mod`. No file overlap, no import relationship.
  *Depends on Wave 1:* all three read `schemas/*.schema.json` from Task 1; Task 2 invokes the `schemas:check` script Task 1 added.

**Wave 3: Lane-plan validation** — depends on the `contract` package
- Task 6 (go-engineer) — lane-plan validation + route `handoff`/`vibe-coord`

  *Parallel-safe because:* only one task in wave.
  *Depends on:* Task 1 (`vibe-lane-plan.schema.json`) and Task 5 (`internal/contract` package + jsonschema dep in `go.mod`).

### Dependency Graph

```
Task 1 → Task 2
Task 1 → Task 4
Task 1 → Task 5
Task 1 → Task 6
Task 5 → Task 6
Task 3 (no dependencies)
```

### Lifetime Plan

| Specialist | Waves | Lifetime strategy |
|---|---|---|
| ts-engineer | 1, 2 | Full-session (2 waves of work) |
| go-engineer | 1, 2, 3 | Full-session (3 waves of work) |
| devops-engineer | 2 | Spawn for Wave 2, shut down after Wave 2 |

---

### [ts-engineer] Task 1: Canonical JSON Schemas + conformance check

**Specialist:** ts-engineer
**Depends on:** None
**Produces:** `schemas/vibe-self-plan.schema.json` and `schemas/vibe-lane-plan.schema.json` (canonical IR contracts), `schemas/README.md`, `scripts/check-schemas.mjs`, and a root `schemas:check` pnpm script. These are the source of truth consumed by Tasks 2, 4, 5, and 6.

**Files:**
- Create: `schemas/vibe-self-plan.schema.json`
- Create: `schemas/vibe-lane-plan.schema.json`
- Create: `scripts/check-schemas.mjs`
- Create: `schemas/README.md`
- Modify: `package.json` (root — add `ajv` devDependency + `schemas:check` script)

- [ ] **Step 1: Write the self-plan schema**

Create `schemas/vibe-self-plan.schema.json`. It mirrors the `VibeSelfPlan` interface in `packages/language/src/self/self-plan.ts` exactly; `additionalProperties: false` makes a renamed/typo'd field a validation failure (the drift we are guarding against). `metadata` is intentionally free-form.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://vibecade.dev/schemas/vibe-self-plan.schema.json",
  "title": "Vibe Self-Plan",
  "description": "Contract for the self-plan IR emitted by @vibe/language (extractSelfPlan) and consumed by the Go runtime (internal/selfplan).",
  "type": "object",
  "additionalProperties": false,
  "required": ["name", "source", "providers", "routes", "surfaces", "agents", "lanes", "gates", "notes"],
  "properties": {
    "name": { "type": "string", "minLength": 1 },
    "source": { "type": "string" },
    "repo": { "type": "string" },
    "fallback": { "type": "string" },
    "providers": { "type": "array", "items": { "$ref": "#/$defs/provider" } },
    "routes": { "type": "object", "additionalProperties": { "type": "string" } },
    "surfaces": { "type": "array", "items": { "$ref": "#/$defs/surface" } },
    "agents": { "type": "array", "items": { "$ref": "#/$defs/agent" } },
    "lanes": { "type": "array", "items": { "$ref": "#/$defs/lane" } },
    "gates": { "type": "array", "items": { "$ref": "#/$defs/gate" } },
    "notes": { "type": "array", "items": { "type": "string" } }
  },
  "$defs": {
    "metadata": { "type": "object" },
    "provider": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "metadata"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "mode": { "type": "string" },
        "model": { "type": "string" },
        "metadata": { "$ref": "#/$defs/metadata" }
      }
    },
    "surface": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "metadata"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "kind": { "type": "string" },
        "mode": { "type": "string" },
        "metadata": { "$ref": "#/$defs/metadata" }
      }
    },
    "agent": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "uses"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "persona": { "type": "string" },
        "memory": { "type": "string" },
        "harness": { "type": "string" },
        "uses": { "type": "array", "items": { "type": "string" } }
      }
    },
    "lane": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "metadata"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "impl": { "type": "string" },
        "owns": { "type": "string" },
        "emits": { "type": "string" },
        "target": { "type": "string" },
        "reads": { "type": "array", "items": { "type": "string" } },
        "verify": { "type": "array", "items": { "type": "string" } },
        "approval": { "type": "string" },
        "metadata": { "$ref": "#/$defs/metadata" }
      }
    },
    "gate": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "metadata"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "impl": { "type": "string" },
        "owns": { "type": "string" },
        "emits": { "type": "string" },
        "metadata": { "$ref": "#/$defs/metadata" }
      }
    }
  }
}
```

- [ ] **Step 2: Write the lane-plan schema**

Create `schemas/vibe-lane-plan.schema.json`. Mirrors `lanes.Plan`/`lanes.Lane` (`go/internal/lanes/types.go`); `mode` enum matches `ModeCodexWeb`/`ModeLocal` and the `emitLane` switch.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://vibecade.dev/schemas/vibe-lane-plan.schema.json",
  "title": "Vibe Lane-Plan",
  "description": "Contract for the lane-plan IR consumed by the Go runtime (internal/lanes) via `vibe handoff --plan` and vibe-coord.",
  "type": "object",
  "additionalProperties": false,
  "required": ["name", "repo", "lanes"],
  "properties": {
    "name": { "type": "string", "minLength": 1 },
    "repo": { "type": "string", "minLength": 1 },
    "lanes": { "type": "array", "items": { "$ref": "#/$defs/lane" } }
  },
  "$defs": {
    "lane": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "mode"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "mode": { "type": "string", "enum": ["codex.web", "local"] },
        "branch": { "type": "string" },
        "reads": { "type": "array", "items": { "type": "string" } },
        "writes": { "type": "array", "items": { "type": "string" } },
        "prompt": { "type": "string" },
        "requires": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

- [ ] **Step 2.5: Verify the committed example plans actually parse as JSON first**

Confirm the fixtures the check script will load are present:

Run: `node -e "JSON.parse(require('fs').readFileSync('docs/examples/vibe-self-plan.json','utf8')); JSON.parse(require('fs').readFileSync('docs/examples/pawfall-feedback-lanes.json','utf8')); console.log('fixtures parse')"`
Expected: `fixtures parse`

- [ ] **Step 3: Write the conformance check script**

Create `scripts/check-schemas.mjs`. It validates both committed fixtures against their schemas (positive cases) and asserts the self-plan schema rejects a plan missing `name` (negative case, so the check is not vacuous).

```js
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
const selfValidate = ajv.compile(load("schemas/vibe-self-plan.schema.json"));
const missingName = { source: "x", providers: [], routes: {}, surfaces: [], agents: [], lanes: [], gates: [], notes: [] };
if (selfValidate(missingName)) {
  failed = true;
  console.error("FAIL: self-plan schema accepted an object missing `name`");
} else {
  console.log("ok: self-plan schema rejects a plan missing `name`");
}

if (failed) process.exit(1);
console.log("all schema checks passed");
```

- [ ] **Step 4: Add the ajv devDependency and the `schemas:check` script to the root package.json**

In `package.json` (repo root), add `"schemas:check": "node scripts/check-schemas.mjs"` to `scripts` (place it next to `self:read`), and add a top-level `devDependencies` block (the root currently has none):

```json
  "devDependencies": {
    "ajv": "^8.17.1"
  },
```

- [ ] **Step 5: Install and run the check (expect it to fail first if a schema is wrong)**

Run: `pnpm install`
Expected: ajv added; `pnpm-lock.yaml` updated.

Run: `pnpm run schemas:check`
Expected: PASS —
```
ok: docs/examples/vibe-self-plan.json satisfies schemas/vibe-self-plan.schema.json
ok: docs/examples/pawfall-feedback-lanes.json satisfies schemas/vibe-lane-plan.schema.json
ok: self-plan schema rejects a plan missing `name`
all schema checks passed
```
If a fixture FAILS, the schema is too strict for real data — read `validate.errors`, correct the schema in Step 1/2 to accept the committed fixture, and re-run until green. (Do not loosen `required` below the fields the fixture actually contains.)

- [ ] **Step 6: Write the contract README**

Create `schemas/README.md`:

```markdown
# Vibe IR Schemas

Canonical JSON Schemas (Draft 2020-12) for the two IRs that cross the
TypeScript ↔ Go boundary. These files are the **source of truth** for shape.

## `vibe-self-plan.schema.json`

The self-plan IR.

- **Producer:** `@vibe/language` — `extractSelfPlan` (`packages/language/src/self/self-plan.ts`).
- **Emitted to:** `docs/examples/vibe-self-plan.json` via `pnpm run self:plan`.
- **Consumer:** Go `internal/selfplan` (`vibe lanes | graph | serve | continue`).
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
```

- [ ] **Step 7: Commit**

```bash
git add schemas/ scripts/check-schemas.mjs package.json pnpm-lock.yaml
git commit -m "feat(schemas): add canonical self-plan and lane-plan IR contracts"
```

---

### [go-engineer] Task 3: CLI smoke tests + honest Go docs

**Specialist:** go-engineer
**Depends on:** None
**Produces:** Table-driven smoke tests in `go/cmd/vibe/main_test.go` covering `lanes`, `graph`, `handoff` (self-plan + lane-plan), and `make-plan` against the committed fixtures; a corrected `go/README.md`; a superseding note on the spike plan. The smoke tests use the committed (schema-valid) fixtures so they survive the `Load` validation added in Task 5.

**Files:**
- Modify: `go/cmd/vibe/main_test.go`
- Modify: `go/README.md`
- Modify: `docs/superpowers/plans/2026-05-15-vibe-go-runtime-spike.md`

- [ ] **Step 1: Confirm the runtime is green before changing anything**

Run: `go -C go test ./...`
Expected: all packages `ok` (this establishes the green baseline the spike doc wrongly claims is impossible).

- [ ] **Step 2: Add a stdout-capture helper and the lanes/graph/make-plan smoke tests**

Replace the body of `go/cmd/vibe/main_test.go` with the following (keeps the existing self-plan handoff test but points it at the committed fixture so it stays schema-valid). These tests must not call `t.Parallel()` — `captureStdout` swaps the process-global `os.Stdout`.

```go
package main

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// repoFixture resolves a path relative to the repo root so tests can use the
// committed (schema-valid) example plans.
func repoFixture(t *testing.T, rel string) string {
	t.Helper()
	abs, err := filepath.Abs(filepath.Join("..", "..", "..", rel))
	if err != nil {
		t.Fatalf("resolve fixture %s: %v", rel, err)
	}
	if _, err := os.Stat(abs); err != nil {
		t.Fatalf("fixture not found %s: %v", abs, err)
	}
	return abs
}

// captureStdout redirects os.Stdout for the duration of fn and returns what was written.
func captureStdout(t *testing.T, fn func() error) (string, error) {
	t.Helper()
	old := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}
	os.Stdout = w
	runErr := fn()
	_ = w.Close()
	os.Stdout = old
	out, _ := io.ReadAll(r)
	return string(out), runErr
}

func TestRunHandoffAcceptsSelfPlan(t *testing.T) {
	outDir := filepath.Join(t.TempDir(), "handoffs")
	planPath := repoFixture(t, "docs/examples/vibe-self-plan.json")

	if err := runHandoff(context.Background(), []string{"--self-plan", planPath, "--out", outDir}); err != nil {
		t.Fatalf("runHandoff returned error: %v", err)
	}

	handoff, err := os.ReadFile(filepath.Join(outDir, "local_toolkit_lane.md"))
	if err != nil {
		t.Fatalf("read exported handoff: %v", err)
	}
	if !strings.Contains(string(handoff), "# Vibe Lane Handoff: local_toolkit_lane") {
		t.Fatalf("unexpected exported handoff:\n%s", string(handoff))
	}
}

func TestRunLanesPrintsLaneTable(t *testing.T) {
	planPath := repoFixture(t, "docs/examples/vibe-self-plan.json")
	out, err := captureStdout(t, func() error {
		return runLanes([]string{"--plan", planPath})
	})
	if err != nil {
		t.Fatalf("runLanes returned error: %v", err)
	}
	for _, want := range []string{"vibe-self", "LANE", "local_toolkit_lane"} {
		if !strings.Contains(out, want) {
			t.Fatalf("lanes output missing %q:\n%s", want, out)
		}
	}
}

func TestRunGraphWritesMermaid(t *testing.T) {
	planPath := repoFixture(t, "docs/examples/vibe-self-plan.json")
	outPath := filepath.Join(t.TempDir(), "lanes.mmd")
	if err := runGraph([]string{"--plan", planPath, "--out", outPath}); err != nil {
		t.Fatalf("runGraph returned error: %v", err)
	}
	graph, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("read mermaid: %v", err)
	}
	if !strings.Contains(string(graph), "flowchart LR") {
		t.Fatalf("unexpected mermaid output:\n%s", string(graph))
	}
}

func TestRunHandoffAcceptsLanePlan(t *testing.T) {
	outDir := filepath.Join(t.TempDir(), "handoffs")
	planPath := repoFixture(t, "docs/examples/pawfall-feedback-lanes.json")
	if err := runHandoff(context.Background(), []string{"--plan", planPath, "--out", outDir}); err != nil {
		t.Fatalf("runHandoff --plan returned error: %v", err)
	}
	entries, err := os.ReadDir(outDir)
	if err != nil || len(entries) == 0 {
		t.Fatalf("expected handoff files in %s (err=%v)", outDir, err)
	}
}

func TestRunMakePlanWritesJSON(t *testing.T) {
	outPath := filepath.Join(t.TempDir(), "self-plan.json")
	out, err := captureStdout(t, func() error {
		return runMakePlan(context.Background(), []string{"--repo", ".", "--out", outPath})
	})
	if err != nil {
		t.Fatalf("runMakePlan returned error: %v", err)
	}
	if !strings.Contains(out, outPath) {
		t.Fatalf("make-plan did not print output path: %q", out)
	}
	raw, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("read generated plan: %v", err)
	}
	if !strings.Contains(string(raw), "\"lanes\"") {
		t.Fatalf("generated plan missing lanes:\n%s", string(raw))
	}
}
```

- [ ] **Step 3: Run the smoke tests**

Run: `go -C go test ./cmd/vibe/`
Expected: PASS (`ok  github.com/lutherfourie/vibe/go/cmd/vibe`).
If `runLanes`/`runGraph`/`runMakePlan`/`runHandoff` signatures differ from those used above, read `go/cmd/vibe/main.go` and match them exactly (they are unexported functions in `package main`).

- [ ] **Step 4: Correct the stale claim in go/README.md**

In `go/README.md`, replace the paragraph:

```
Go is not installed in the current development environment, so this spike is
checked in as source only until a Go toolchain is available.
```

with:

```
The runtime builds and tests under Go 1.22+ (`go/go.mod`). Run `go test ./...`
from the `go/` directory. CI (`.github/workflows/ci.yml`) gates build, vet,
gofmt, and tests on every push and pull request.
```

- [ ] **Step 5: Add a superseding note to the spike plan**

In `docs/superpowers/plans/2026-05-15-vibe-go-runtime-spike.md`, under the `## Verification` heading, insert as the first line of that section:

```
> Superseded 2026-05-27: Go 1.26 is installed and `go test ./...` passes. See
> docs/superpowers/plans/2026-05-27-vibe-go-runtime-harden.md and the CI workflow.
```

- [ ] **Step 6: Verify formatting and full Go suite**

Run: `gofmt -l go`
Expected: no output (all files formatted).

Run: `go -C go test ./...`
Expected: all packages `ok`.

- [ ] **Step 7: Commit**

```bash
git add go/cmd/vibe/main_test.go go/README.md docs/superpowers/plans/2026-05-15-vibe-go-runtime-spike.md
git commit -m "test(go): add cmd/vibe CLI smoke tests; correct stale Go-not-installed docs"
```

---

### [devops-engineer] Task 2: GitHub Actions CI

**Specialist:** devops-engineer
**Depends on:** Task 1 (the `schemas:check` script + `ajv` in the committed `pnpm-lock.yaml`)
**Produces:** `.github/workflows/ci.yml` — a Go job (build/vet/gofmt/test) and a Node job (`schemas:check` + `pnpm run check` + self-plan drift guard), running on push and pull_request.

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Verify the Go job commands locally**

Run: `go -C go build ./...` → Expected: no output, exit 0.
Run: `go -C go vet ./...` → Expected: no output, exit 0.
Run: `gofmt -l go` → Expected: no output.
Run: `go -C go test ./...` → Expected: all packages `ok`.

- [ ] **Step 2: Verify the Node job commands locally**

Run: `pnpm install --frozen-lockfile` → Expected: lockfile satisfied (Task 1 committed the `ajv` lockfile change).
Run: `pnpm run schemas:check` → Expected: `all schema checks passed`.
Run: `pnpm run check` → Expected: self:plan + tests + build all succeed.
Run: `git diff --exit-code -- docs/examples/vibe-self-plan.json` → Expected: exit 0 (no drift).

If the drift guard fails, run `pnpm run self:plan`, inspect `git diff docs/examples/vibe-self-plan.json`. If it is a legitimate regeneration, `git add` + commit the updated file as part of this task; if it reveals a producer bug, report `DONE_WITH_CONCERNS` to the lead.

- [ ] **Step 3: Write the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: ["**"]
  pull_request:

jobs:
  go:
    name: Go runtime
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: go
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: go/go.mod
      - run: go build ./...
      - run: go vet ./...
      - name: gofmt
        run: |
          unformatted="$(gofmt -l .)"
          if [ -n "$unformatted" ]; then
            echo "Not gofmt-clean:"; echo "$unformatted"; exit 1
          fi
      - run: go test ./...

  node:
    name: Workspaces + contract
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Schema conformance
        run: pnpm run schemas:check
      - name: Check (self:plan + test + build)
        run: pnpm run check
      - name: Self-plan drift guard
        run: git diff --exit-code -- docs/examples/vibe-self-plan.json
```

Note: `pnpm/action-setup@v4` reads the pnpm version from the root `package.json` `packageManager` field (`pnpm@10.33.4`); no `version:` needed. To also exercise the Windows-first runtime later, add a `windows-latest` entry via a matrix on the `go` job.

- [ ] **Step 4: Lint the workflow YAML**

Run: `npx --yes action-validator .github/workflows/ci.yml`
Expected: no errors. (If `action-validator` is unavailable offline, instead confirm valid YAML: `node -e "require('js-yaml')" 2>/dev/null && npx --yes js-yaml .github/workflows/ci.yml >/dev/null && echo "yaml ok"` — or visually verify indentation. Do not block on tooling availability; the commands in Steps 1–2 are the real verification.)

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: gate Go runtime and pnpm workspaces with schema + drift checks"
```

---

### [ts-engineer] Task 4: TS-side schema-conformance test

**Specialist:** ts-engineer
**Depends on:** Task 1 (`schemas/vibe-self-plan.schema.json`)
**Produces:** `packages/language/test/self-plan-schema.test.ts` — a Vitest contract test proving `extractSelfPlanFromSource` emits a schema-conformant plan, that the committed `vibe-self-plan.json` conforms, and that the schema rejects a plan missing a required field. Adds `ajv` to `@vibe/language`.

**Files:**
- Modify: `packages/language/package.json` (add `ajv` devDependency)
- Create: `packages/language/test/self-plan-schema.test.ts`

- [ ] **Step 1: Add ajv to the language package**

In `packages/language/package.json`, add to `devDependencies`:

```json
    "ajv": "^8.17.1",
```

Run: `pnpm install`
Expected: ajv resolved for `@vibe/language`; `pnpm-lock.yaml` updated.

- [ ] **Step 2: Write the conformance test**

Create `packages/language/test/self-plan-schema.test.ts`. Imports use `.js` extensions to match the repo's NodeNext ESM convention (see `src/self/self-plan.ts`).

```ts
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { extractSelfPlanFromSource } from "../src/self/self-plan.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const schema = JSON.parse(
  readFileSync(resolve(repoRoot, "schemas/vibe-self-plan.schema.json"), "utf8"),
);

function makeValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  return ajv.compile(schema);
}

describe("self-plan IR contract", () => {
  it("extractSelfPlanFromSource emits a schema-conformant plan", async () => {
    const source = readFileSync(resolve(repoRoot, "examples/vibe-self.vibe"), "utf8");
    const plan = await extractSelfPlanFromSource(source, {
      sourceName: "examples/vibe-self.vibe",
    });
    const validate = makeValidator();
    const ok = validate(plan);
    if (!ok) console.error(validate.errors);
    expect(ok).toBe(true);
  });

  it("the committed vibe-self-plan.json conforms", () => {
    const committed = JSON.parse(
      readFileSync(resolve(repoRoot, "docs/examples/vibe-self-plan.json"), "utf8"),
    );
    const validate = makeValidator();
    const ok = validate(committed);
    if (!ok) console.error(validate.errors);
    expect(ok).toBe(true);
  });

  it("rejects a plan missing a required field", () => {
    const validate = makeValidator();
    expect(validate({ source: "x" })).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `pnpm --filter @vibe/language test`
Expected: the new `self-plan IR contract` suite passes (3 tests) alongside the existing suite.

If the first test FAILS, the producer emits a shape the schema rejects — read the printed `validate.errors`. Either the schema (Task 1) is wrong, or the producer changed; report `DONE_WITH_CONCERNS` with the error detail so the lead can reconcile with Task 1's owner. Do not weaken the test to force a pass.

- [ ] **Step 4: Commit**

```bash
git add packages/language/package.json packages/language/test/self-plan-schema.test.ts pnpm-lock.yaml
git commit -m "test(language): assert self-plan output conforms to the IR schema"
```

---

### [go-engineer] Task 5: Go self-plan validation + contract package

**Specialist:** go-engineer
**Depends on:** Task 1 (`schemas/vibe-self-plan.schema.json`)
**Produces:** `go/internal/contract` package (`Validate(schemaFile, raw)` loading canonical schemas from repo-root `schemas/`); `selfplan.Load` now fails fast on schema violation; `go.mod` gains `github.com/santhosh-tekuri/jsonschema/v5`. The `contract` package is reused by Task 6.

**Files:**
- Create: `go/internal/contract/contract.go`
- Create: `go/internal/contract/contract_test.go`
- Modify: `go/internal/selfplan/selfplan.go`
- Modify: `go/internal/selfplan/selfplan_test.go`
- Modify: `go/go.mod`, `go/go.sum`

- [ ] **Step 1: Add the jsonschema dependency**

Run: `go -C go get github.com/santhosh-tekuri/jsonschema/v5@v5.3.1`
Expected: `go.mod`/`go.sum` updated with the dependency.

- [ ] **Step 2: Write the contract package**

Create `go/internal/contract/contract.go`:

```go
// Package contract validates Vibe IR documents against the canonical JSON
// Schemas in the repo-root schemas/ directory.
package contract

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v5"
)

// Canonical schema file names within the repo-root schemas/ directory.
const (
	SelfPlanSchema = "vibe-self-plan.schema.json"
	LanePlanSchema = "vibe-lane-plan.schema.json"
)

var (
	mu       sync.Mutex
	compiled = map[string]*jsonschema.Schema{}
)

// Validate checks raw JSON against the named canonical schema. It returns a
// descriptive error (with the offending JSON path) when the document is invalid.
func Validate(schemaFile string, raw []byte) error {
	schema, err := loadSchema(schemaFile)
	if err != nil {
		return err
	}
	var doc interface{}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return fmt.Errorf("parse JSON for validation: %w", err)
	}
	if err := schema.Validate(doc); err != nil {
		return fmt.Errorf("schema %s: %w", schemaFile, err)
	}
	return nil
}

func loadSchema(schemaFile string) (*jsonschema.Schema, error) {
	mu.Lock()
	defer mu.Unlock()
	if s, ok := compiled[schemaFile]; ok {
		return s, nil
	}
	dir, err := schemasDir()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(filepath.Join(dir, schemaFile))
	if err != nil {
		return nil, fmt.Errorf("read schema %s: %w", schemaFile, err)
	}
	c := jsonschema.NewCompiler()
	if err := c.AddResource(schemaFile, bytes.NewReader(data)); err != nil {
		return nil, fmt.Errorf("add schema %s: %w", schemaFile, err)
	}
	s, err := c.Compile(schemaFile)
	if err != nil {
		return nil, fmt.Errorf("compile schema %s: %w", schemaFile, err)
	}
	compiled[schemaFile] = s
	return s, nil
}

// schemasDir walks up from the working directory to the repo root (identified
// by pnpm-workspace.yaml) and returns its schemas/ directory.
func schemasDir() (string, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for dir := cwd; ; {
		if _, statErr := os.Stat(filepath.Join(dir, "pnpm-workspace.yaml")); statErr == nil {
			return filepath.Join(dir, "schemas"), nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("locate repo root (pnpm-workspace.yaml) from %s", cwd)
		}
		dir = parent
	}
}
```

- [ ] **Step 3: Write the contract test**

Create `go/internal/contract/contract_test.go`:

```go
package contract

import (
	"strings"
	"testing"
)

func TestValidateRejectsSelfPlanMissingName(t *testing.T) {
	err := Validate(SelfPlanSchema, []byte(`{"source":"x","providers":[],"routes":{},"surfaces":[],"agents":[],"lanes":[],"gates":[],"notes":[]}`))
	if err == nil {
		t.Fatal("expected validation error for self-plan missing name")
	}
}

func TestValidateRejectsLanePlanBadMode(t *testing.T) {
	err := Validate(LanePlanSchema, []byte(`{"name":"p","repo":"r","lanes":[{"name":"l","mode":"bogus"}]}`))
	if err == nil {
		t.Fatal("expected validation error for invalid lane mode")
	}
	if !strings.Contains(err.Error(), LanePlanSchema) {
		t.Fatalf("error should name the schema: %v", err)
	}
}

func TestValidateAcceptsMinimalValidLanePlan(t *testing.T) {
	if err := Validate(LanePlanSchema, []byte(`{"name":"p","repo":"r","lanes":[{"name":"l","mode":"local"}]}`)); err != nil {
		t.Fatalf("valid lane-plan rejected: %v", err)
	}
}
```

- [ ] **Step 4: Run the contract test (verify it passes)**

Run: `go -C go test ./internal/contract/`
Expected: `ok  github.com/lutherfourie/vibe/go/internal/contract`. (Tests run with the package dir as CWD; `schemasDir` walks up to the repo root and finds `schemas/`.)

- [ ] **Step 5: Wire validation into selfplan.Load**

In `go/internal/selfplan/selfplan.go`, add the import `"github.com/lutherfourie/vibe/go/internal/contract"`, and change `Load` to validate before decoding. Leave `Parse` unchanged (it stays the lenient decoder used by unit tests).

Replace:

```go
func Load(path string) (Plan, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Plan{}, fmt.Errorf("read self-plan: %w", err)
	}
	return Parse(raw)
}
```

with:

```go
func Load(path string) (Plan, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Plan{}, fmt.Errorf("read self-plan: %w", err)
	}
	if err := contract.Validate(contract.SelfPlanSchema, raw); err != nil {
		return Plan{}, fmt.Errorf("invalid self-plan %s: %w", path, err)
	}
	return Parse(raw)
}
```

- [ ] **Step 6: Add Load validation tests**

Append to `go/internal/selfplan/selfplan_test.go` (the file already imports `os`, `path/filepath`, `testing`):

```go
func TestLoadRejectsInvalidSelfPlan(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bad.json")
	if err := os.WriteFile(path, []byte(`{"name":"x"}`), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	if _, err := Load(path); err == nil {
		t.Fatal("expected Load to reject a self-plan that violates the schema")
	}
}

func TestLoadAcceptsCommittedSelfPlan(t *testing.T) {
	path := filepath.Join("..", "..", "..", "docs", "examples", "vibe-self-plan.json")
	if _, err := Load(path); err != nil {
		t.Fatalf("committed self-plan should load: %v", err)
	}
}
```

- [ ] **Step 7: Run the selfplan suite (existing Parse tests must stay green)**

Run: `go -C go test ./internal/selfplan/`
Expected: `ok` — including the pre-existing `TestParseReadsLaneTargetsAndVerification` (unchanged, because `Parse` is still lenient) and the two new `Load` tests.

- [ ] **Step 8: Run the full Go suite and gofmt**

Run: `go -C go test ./...` → Expected: all `ok` (Task 3's `cmd/vibe` smoke tests use the committed valid fixtures, so `Load` validation does not break them).
Run: `gofmt -l go` → Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add go/internal/contract/ go/internal/selfplan/ go/go.mod go/go.sum
git commit -m "feat(go): validate self-plans against the canonical schema in selfplan.Load"
```

---

### [go-engineer] Task 6: Lane-plan validation + route handoff and vibe-coord

**Specialist:** go-engineer
**Depends on:** Task 1 (`schemas/vibe-lane-plan.schema.json`), Task 5 (`internal/contract` package + jsonschema in `go.mod`)
**Produces:** `lanes.ParsePlan(raw)` — a validating decoder for the lane-plan IR — with both `vibe handoff --plan` and `vibe-coord emit` routed through it. Malformed lane-plans now fail fast.

**Files:**
- Modify: `go/internal/lanes/coordinator.go` (add `ParsePlan`)
- Modify: `go/internal/lanes/coordinator_test.go` (add `ParsePlan` tests)
- Modify: `go/cmd/vibe/main.go` (route `runHandoff --plan` through `ParsePlan`)
- Modify: `go/cmd/vibe-coord/main.go` (route `runEmit` through `ParsePlan`)

- [ ] **Step 1: Add the validating parse entrypoint**

In `go/internal/lanes/coordinator.go`, add the imports `"encoding/json"` and `"github.com/lutherfourie/vibe/go/internal/contract"` (the file already imports `fmt`), and add:

```go
// ParsePlan validates raw lane-plan JSON against the canonical schema and decodes it.
func ParsePlan(raw []byte) (Plan, error) {
	if err := contract.Validate(contract.LanePlanSchema, raw); err != nil {
		return Plan{}, fmt.Errorf("invalid lane-plan: %w", err)
	}
	var plan Plan
	if err := json.Unmarshal(raw, &plan); err != nil {
		return Plan{}, fmt.Errorf("parse lane-plan JSON: %w", err)
	}
	return plan, nil
}
```

- [ ] **Step 2: Add ParsePlan tests**

Append to `go/internal/lanes/coordinator_test.go` (add `"path/filepath"` and `"testing"` is already imported):

```go
func TestParsePlanRejectsBadMode(t *testing.T) {
	_, err := ParsePlan([]byte(`{"name":"p","repo":"r","lanes":[{"name":"l","mode":"nope"}]}`))
	if err == nil {
		t.Fatal("expected ParsePlan to reject an invalid lane mode")
	}
}

func TestParsePlanAcceptsCommittedLanePlan(t *testing.T) {
	path := filepath.Join("..", "..", "..", "docs", "examples", "pawfall-feedback-lanes.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	if _, err := ParsePlan(raw); err != nil {
		t.Fatalf("committed lane-plan should parse: %v", err)
	}
}
```

Add `"os"` to the imports of `coordinator_test.go` (currently it only imports `testing`).

- [ ] **Step 3: Run the lanes suite**

Run: `go -C go test ./internal/lanes/`
Expected: `ok` — the pre-existing `ValidatePlan` tests (struct-based) are unaffected; the two new `ParsePlan` tests pass.

- [ ] **Step 4: Route `vibe handoff --plan` through ParsePlan**

In `go/cmd/vibe/main.go`, inside `runHandoff`, replace the lane-plan branch:

```go
	raw, err := os.ReadFile(resolveRepoPath(*planPath))
	if err != nil {
		return fmt.Errorf("read plan: %w", err)
	}

	var plan lanes.Plan
	if err := json.Unmarshal(raw, &plan); err != nil {
		return fmt.Errorf("parse plan JSON: %w", err)
	}
```

with:

```go
	raw, err := os.ReadFile(resolveRepoPath(*planPath))
	if err != nil {
		return fmt.Errorf("read plan: %w", err)
	}

	plan, err := lanes.ParsePlan(raw)
	if err != nil {
		return err
	}
```

If `encoding/json` becomes unused in `main.go` after this change, leave it — it is still used by `runContinue`, `runDoctor`, `runLanes`, `runServe`, and `runMakePlan`. (Confirm with `go -C go build ./...` in Step 6.)

- [ ] **Step 5: Route `vibe-coord emit` through ParsePlan**

In `go/cmd/vibe-coord/main.go`, replace:

```go
	raw, err := os.ReadFile(*planPath)
	if err != nil {
		return fmt.Errorf("read plan: %w", err)
	}

	var plan lanes.Plan
	if err := json.Unmarshal(raw, &plan); err != nil {
		return fmt.Errorf("parse plan JSON: %w", err)
	}
```

with:

```go
	raw, err := os.ReadFile(*planPath)
	if err != nil {
		return fmt.Errorf("read plan: %w", err)
	}

	plan, err := lanes.ParsePlan(raw)
	if err != nil {
		return err
	}
```

Then remove the now-unused `"encoding/json"` import from `go/cmd/vibe-coord/main.go` (it is no longer referenced there).

- [ ] **Step 6: Build, test, and format the whole module**

Run: `go -C go build ./...` → Expected: exit 0 (catches any unused-import error from Steps 4–5).
Run: `go -C go test ./...` → Expected: all packages `ok` (including Task 3's `TestRunHandoffAcceptsLanePlan`, which uses the committed valid pawfall fixture).
Run: `go -C go vet ./...` → Expected: exit 0.
Run: `gofmt -l go` → Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add go/internal/lanes/ go/cmd/vibe/main.go go/cmd/vibe-coord/main.go
git commit -m "feat(go): validate lane-plans against the schema in handoff and vibe-coord"
```

---

## Notes for the executing team

- **Do not** run `git push` or open a PR from task steps; the lead handles integration via `finishing-a-development-branch` after all reviews pass.
- The committed example plans (`docs/examples/vibe-self-plan.json`, `docs/examples/pawfall-feedback-lanes.json`) are the shared fixtures. They must remain schema-valid; if Task 1's schema rejects them, fix the schema, not the fixtures.
- `Parse` (selfplan) stays lenient by design so existing byte-level unit tests keep working; validation lives in `Load`. Do not add schema validation to `Parse` or to `lanes.ValidatePlan` (the struct validator) — only to the JSON entrypoints `selfplan.Load` and `lanes.ParsePlan`.
- Go test commands use `go -C go ...` so they run from the module root regardless of the caller's directory.
