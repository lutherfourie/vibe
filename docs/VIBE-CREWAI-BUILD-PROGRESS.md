# VIBE-CREWAI-BUILD-PROGRESS

**PHASE 0 — Assess + Plan Only**  
**Date:** 2026-06-24  
**Status:** Planning artifact (no code changes, no commits, no runtime execution)  
**Owner:** Phase 0 assessment

---

## (a) CURRENT-STATE Assessment — .vibe → CrewAI Path

### Parser / AST (packages/language)

- **Grammar** ([packages/language/src/vibe.langium](/packages/language/src/vibe.langium)): supports top-level declarations including:
  - `provider`, `route`, `fallback`
  - `surface` (e.g. `surface crewai.local { kind = framework mode = python ... }`)
  - `persona name { description = "..." ... }`
  - `plugin name { impl=... owns=... target=... reads=[...] verify=[...] approval=... emits=... }`
  - `agent name { persona=... memory=... harness=... uses=[...] }`
  - `autonomous-session name { lanes = [ { name=..., steps=[ {type=..., ...} ] } ], checkpoints=..., description=... }`
  - `lane`, `checkpoint`, `self-review`, `research-step`, `tool`, `eval`, `template`, `policy`, `workflow`, etc.
- **AST** ([packages/language/src/generated/ast.ts](/packages/language/src/generated/ast.ts)): `Project.declarations: Declaration[]`. Relevant nodes:
  - `AutonomousSession { name, fields: Field[] }`
  - `Lane { name, fields }` (top-level)
  - `Plugin`, `Surface`, `Persona`, `Provider`, `Agent` — all use open `fields: Field[]` (Expression = string | number | bool | ref | list | object)
  - No strongly-typed `steps` or `lanes` objects yet in AST; they appear as `ObjectExpression` / `ListExpression` inside field values.
- **Extraction** ([packages/language/src/self/self-plan.ts](/packages/language/src/self/self-plan.ts)):
  - `extractSelfPlan` / `extractSelfPlanFromSource` walks declarations.
  - Lanes come from `plugin.*_lane` → `SelfLane` (impl/owns/emits/target/reads/verify/approval + full `metadata`).
  - `autonomousSessions` captured only as `{name, description, laneCount, checkpointCount, metadata}` (counts lanes/checkpoints from list fields; inline step objects not reified).
  - Providers, routes, surfaces, agents, gates (`*_gate` plugins) extracted.
- **No dedicated CrewAI or IaC emitter exists.** Self-plan is the only `.vibe` → JSON IR path today.
- **Resolver/pipeline** ([packages/language/src/pipeline](/packages/language/src/pipeline), resolver) resolves prose regions + persists VibePlan (session/lanes for telemetry), not execution targets.

**Tests** confirm extraction for vibe-self.vibe (incl. `crewai_adapter_lane`).

### Lane-plan IR (Go runtime contract)

- **Schema** ([schemas/vibe-lane-plan.schema.json](/schemas/vibe-lane-plan.schema.json)): `Plan { name, repo, lanes[], tools?, evals?, ... }`
  - `Lane { name, mode: "codex.web"|"local"|"autonomous", reads[], writes[], prompt, requires[], autonomous?, steps[] }`
  - `autonomous { progress, horizon, checkpointEvery, roles[], research }`
  - `steps[]` with `type: "tool"|"eval"|"template"|"policy"|"workflow"|"checkpoint"`, refs, if/then, args.
- **Go IR** ([go/internal/lanes/types.go](/go/internal/lanes/types.go)): mirrors schema exactly (`Plan`, `Lane`, `Autonomous`, `Step`, modern decls).
- **Consumer** ([go/internal/lanes/coordinator.go](/go/internal/lanes/coordinator.go)):
  - `ParsePlan` (schema validate via contract + json)
  - `ValidatePlan` (name required, no overlapping writes, decl names)
  - `EmitHandoffs` → per-lane .md using mode switch to prompts (CodexWeb / Local / Autonomous)
  - For autonomous + decls/steps: appends "Modern Vibe Declarations" + step summary to handoff.
- **Production today**: lane-plan JSON is either handwritten or emitted by `bootstrap.SelfMakingPlan` (hardcoded Go). `vibe handoff --plan` and `vibe handoff --self-plan` both produce markdown briefs. No path from AST → this IR for `autonomous-session` or `lane` decls.

Self-plan lanes (plugin-shaped) and lane-plan lanes (mode+scope+steps) are **parallel** IRs. Coordinator owns the execution contract; selfplan owns the bootstrap/VSCode/dashboard surface.

### Stubs (exactly as specified)

- **[go/internal/adapters/crewai.go](/go/internal/adapters/crewai.go)** (16 lines):
  ```go
  // Stub for CrewAI backend adapter
  func NewCrewAIBackend() Backend { ... }
  type crewAIBackend struct{}
  func (c *crewAIBackend) Execute(lane Lane) ExecutionResult { ... "CrewAI + Vibe IaC executed" }
  ```
  - References `Backend`, `Lane`, `ExecutionResult` — **none defined** in the repo (different from `lanes.Lane`).
  - Never imported or wired. Zero generation or invocation logic.

- **[go/cmd/vibe/iac-compile.go](/go/cmd/vibe/iac-compile.go)**:
  ```go
  func compileIaCLayer(input string, backend string) {
      print("Vibe IaC compiled to " + backend + " ...")
  }
  ```
  - Comment says "PoC IaC compile command // vibe compile lane.vibe --backend=crewai|langgraph"
  - **Not registered** in [go/cmd/vibe/main.go](/go/cmd/vibe/main.go) (no `compile`/`iac` case in run switch). Dead code.

### Declared CrewAI Surface (vibe-self.vibe)

```vibe
surface crewai.local {
  kind = framework
  mode = python
  docs = "https://docs.crewai.com/llms.txt"
  mcp  = true
}

plugin crewai_adapter_lane {
  impl     = "./tools/crewai-adapter-lane"
  target   = surface.crewai.local
  ...
  approval = human.before_runtime
  emits    = "report-only CrewAI adapter shape; no credentials, install, or runtime MCP changes"
}
```

This lane appears in `vibe lanes`, self-plan JSON, handoffs, and dashboard. It is intentionally **report-only** (see continue.md + crewai-integration-notes.md).

### Mapping Spec (verbatim intent from research)

From [docs/superpowers/research/2026-05-16-vibe-crewai-integration-notes.md](/docs/superpowers/research/2026-05-16-vibe-crewai-integration-notes.md) and [docs/superpowers/research/2026-05-15-vibe-agentic-iac-framework-map.md](/docs/superpowers/research/2026-05-15-vibe-agentic-iac-framework-map.md) + STRATEGY:

| Vibe construct          | CrewAI target                              | Notes |
|-------------------------|--------------------------------------------|-------|
| `provider` / `route`    | LLM configuration (OpenAI etc. + model)    | CrewAI `LLM` or `ChatOpenAI` wrapper; api_key from env or Vibe config |
| `persona`               | Agent(role, goal, backstory)               | `description` is minimal today; future `goal=`, `backstory=`, `role=` fields or derivation |
| `plugin` (tool-shaped)  | Tool / @tool / MCPServerAdapter            | Map `impl` or declared MCP to CrewAI tool |
| `plugin` (lane-shaped)  | Flow / Task / Crew                         | `target = surface.crewai.local` selects CrewAI backend |
| `surface crewai.local`  | Local Python backend                       | Generate or scaffold Python package + `crew.py`/`flow.py`; invoke via subprocess from Go/TS |
| `lane` + `steps` (inside autonomous-session or top-level) | CrewAI Flow (preferred) or sequential Tasks + Crew | Steps (checkpoint, tool, eval) → Flow steps + Vibe gates injected |
| `gate` / `approval=human.*` | `human_feedback()` in Flow or HITL task   | Map to CrewAI human-in-the-loop; Vibe owns the approval ledger (devpool/gate + PROGRESS) |
| `memory`                | CrewAI memory/knowledge (secondary)        | Vibe (vault/spineflow/PROGRESS) remains durable authority |
| `autonomous-session`    | One or more Crews/Flows + Vibe supervisor  | Session = orchestration wrapper around generated crew(s) |

Additional Vibe IaC injected (always):
- Git-scoped write scope enforcement
- PROGRESS.md + `vibe checkpoint` / resume
- devpool worktree isolation + CommandGate verification
- Handoff contract + self-plan link
- Pre-merge / pre-runtime human gates

**Strategy doc** ([docs/STRATEGY-langgraph-crewai-layer.md](/docs/STRATEGY-langgraph-crewai-layer.md)): Vibe is the declarative IaC shell; .vibe compiles to backend + "extra primitives (resume checkpoints stored in git, infra provisioning, self-plan hooks)".

### Reality vs Spec (gaps)

- **Parser/AST**: declarations exist and are validated; inline `lanes`/`steps` inside autonomous-session are opaque field expressions.
- **IRs**: self-plan has the crewai surface + adapter lane (report only). lane-plan supports `mode=autonomous` + `steps` but has no emitter from .vibe AST.
- **Compiler**: none. Only handoff markdown generation (prompt text). The two JS PoCs (`tools/vibe-iac-transpiler.js`, `tools/vibe-iac-compile-full.ts`) are console.log stubs.
- **Executor**: none. `go/agent` has real adapters for codex/claude/openai/grok/mcp; crewai adapter is a non-typechecking stub.
- **CLI/Go wire**: no `vibe compile` / `vibe iac` command. `vibe handoff` only produces .md.
- **Persona shape**: only `description`; CrewAI needs role/goal/backstory.
- **Gates**: approval string + devpool `CommandGate`; no mapping to CrewAI `human_feedback` or Flow pause/resume.
- **Python surface**: declared but no generation of `pyproject.toml`, `crew.py`, tool wrappers, or `main` that wires Vibe hooks.
- **Scope / contract**: write-scope validation exists only for lane-plan; no equivalent enforcement planned for generated CrewAI code yet.
- **Non-goals honored**: still no install, no MCP mutation, no secrets, no live execution.

**Summary**: The .vibe language and self-plan surface already **declare** CrewAI as a target. The compiler, generator, executor, and CLI wiring are entirely missing (stubs only). The mapping spec is written and stable.

---

## (b) CONCRETE Phase Plan (P1 Compiler → P5 Harden)

This plan is the build contract. Each phase has one primary deliverable, one acceptance test (runnable by `pnpm run check` / `go test` / script without live LLM crews), and the **exact** files to create or touch. Work stays report-only + generation until P4.

**Guiding principles**
- Compiler first (pure, testable, no subprocess).
- Generate **CrewAI + Vibe IaC** (Flows preferred for steps; inject gate comments, PROGRESS integration, scope header).
- Use AST or a thin projection of self-plan + autonomous sessions for source of truth in P1.
- Keep Python output minimal but valid + importable (no real CrewAI dep required for tests).
- Gate human-in-loop as generated code + Vibe metadata (do not call live).
- Later phases add executor (subprocess shim + contract), CLI, proof via example, hardening.

### P1: Compiler (pure .vibe/AST → CrewAI artifacts)

**Status: ✅ DONE (2026-06-24)** — commit `198cbf3` on `origin/main` (FF push `688161b..198cbf3`).

Proof:
- Files created: `packages/language/src/crewai/{compiler,types,index}.ts` + `packages/language/test/crewai/compiler.test.ts`; one additive re-export line in `packages/language/src/index.ts`. No Go/CLI/web/examples changes (no `package.json` change — zero new deps).
- `compileCrewAI(project, options?)` + `compileCrewAIFromSource(source, options?)` emit `CrewAICompileResult` via AST (`isPersona`) + `extractSelfPlan` (providers/routes/surfaces/lanes/gates/autonomousSessions). All mapping rules implemented (provider→LLM block, persona→`Agent(role,goal,backstory)`, crewai-targeting plugin→`@tool` stub, `surface crewai.local` selection, lanes/autonomous→`Flow` with `@start`/`@listen` + `VIBE_CHECKPOINT` plus `Crew`+`Task` fallback, `approval=human.*`/`_gate`→`human_feedback()` + `VIBE_GATE`, always-on Vibe IaC header w/ PROGRESS link). Manifest deterministic (no timestamps).
- Verified in main tree: new crewai test green; `npx tsc -p tsconfig.json --noEmit` exit 0; full `@vibe/language` suite **278 passed / 1 failed** — the single failure (`hybrid-demo.vibe` canonical-project) is **pre-existing and unrelated** (malformed prose example in the dirty tree, fails identically at the P0 baseline); `self:plan` unchanged (exit 0).

**Deliverable**  
A new pure-TS compiler in `@vibe/language`:
- Input: parsed `Project` (or `VibeSelfPlan` + autonomous session expansion) + target surface.
- Output: `CrewAICompileResult { crewPy: string, toolsPy?: string, flowPy?: string, manifest: object, vibeContractMd: string, diagnostics: string[] }`
- Rules implemented:
  - `provider` + `route` → LLM config block (commented env notes)
  - `persona` → `Agent(role=..., goal=derived or default, backstory=description or fields)`
  - `plugin` (with target=crewai.local or tool decl) → `@tool` functions or MCP adapter stubs
  - `surface crewai.local` selects this backend
  - `autonomous-session.lanes[].steps` or top-level `lane` → CrewAI `Flow` (or `Crew` + `Task` sequence) with `@start`/`@listen` + checkpoint markers
  - `gate` / approval → `human_feedback()` placeholder + Vibe gate comment block
  - Always inject: header with Vibe scope/verify/approval + link to PROGRESS.md contract

**Acceptance test**  
`pnpm --filter @vibe/language test -- --grep "crewai"` (or new `crewai-compiler.test.ts`) must pass with:
- Parse `examples/08-agent.vibe` + a minimal crewai lane → produces syntactically plausible `crew.py` containing `from crewai import Agent, Task, Crew, Flow` + role/goal + Vibe IaC header.
- Roundtrip: generated manifest roundtrips key fields (persona name, lane step count).
- No network, no python exec, no CrewAI install. Snapshot or string-contains assertions.
- `pnpm run self:plan` still passes unchanged (compiler is additive).

**Exact files to touch / create**
- Create: `packages/language/src/crewai/compiler.ts`
- Create: `packages/language/src/crewai/types.ts` (result + options interfaces)
- Create: `packages/language/src/crewai/index.ts` (export)
- Create: `packages/language/test/crewai/compiler.test.ts`
- Touch (minimal): `packages/language/src/index.ts` (re-export crewai if public), `packages/language/package.json` (no new deps)
- Touch (docs only if needed): `packages/language/README.md` (one sentence)
- Do **not** touch Go, CLI, or examples beyond test fixtures in this phase.

### P2: Executor (local Python shim + Vibe contract runner)

**Deliverable**  
Executor surface (can live in Go first for subprocess safety, or thin TS):
- Given generated `crew.py` dir + Vibe context (lane name, read/write scopes, progress path, verify commands), produce a runnable wrapper or direct `python -m` invocation contract.
- Injects at runtime (or codegen time):
  - Before/after hooks that read/write `PROGRESS.md` (or `.vibe-out/<lane>/progress.md` for isolation)
  - Scope guard (fail if writes outside declared)
  - Gate: emit "VIBE_GATE: human approval required" and pause (or write gate file); continue only on explicit resume signal (file or env)
- No live LLM calls in tests — use a `--dry` / mock crew that prints the contract steps.

**Acceptance test**  
New test (or `go test ./internal/crewai/...` once wired) that:
- Takes P1-generated artifacts (checked into testdata or generated in-mem)
- Calls executor in dry mode → produces stdout containing "Vibe gate", "checkpoint written", exact lane name, and verifies no writes outside mock scope.
- Deterministic; `go test` / vitest only.

**Exact files to touch / create**
- Create: `go/internal/adapters/crewai/executor.go` (real impl; keep old stub file or replace content)
- Create: `go/internal/adapters/crewai/executor_test.go`
- Create (or expand): `go/internal/adapters/crewai/generate.go` (if codegen moves to Go) or keep TS compiler + Go caller
- Create: `go/testdata/crewai/minimal-crew/` (generated .py + expected outputs for test)
- Touch: `go/internal/adapters/crewai.go` (delete stub or make thin wrapper)
- Touch (later): any shared contract types
- No CLI changes yet.

(Alternative: put thin executor shim under `tools/` or `packages/runtime` if Python side preferred; Go is preferred for scope + gate safety per existing devpool.)

### P3: CLI / Go wire + IaC command

**Deliverable**  
- Wire `vibe iac-compile` (or `vibe compile --layer iac --backend crewai`) in main.go + iac-compile.go
- Flags: `--source <file.vibe|self-plan.json>`, `--backend crewai|langgraph`, `--lane <name>`, `--out <dir>`
- Produces: python package skeleton + `vibe-contract.md` + handoff update
- For self-plan lanes that target `crewai.local`, `vibe iac-compile --self-plan ...` emits the crew for that lane.
- Go side can call the TS compiler (via `node dist/...`) or reimplement minimal projection; prefer one source of truth (TS compiler output consumed by Go).

**Acceptance test**
- Build Go binary or `go run ./cmd/vibe iac-compile --help` succeeds.
- `go run ./cmd/vibe iac-compile --source examples/vibe-self.vibe --backend crewai --lane crewai_adapter_lane --out /tmp/crewai-out` (dry) exits 0 and writes files with expected content (grep for "crewai.local", "human_feedback", "PROGRESS").
- `go test ./cmd/vibe` (or main_test) covers the new path with fake compiler.
- `pnpm run check` still green.

**Exact files to touch / create**
- Touch: `go/cmd/vibe/main.go` (add case `"iac-compile"`, `"compile"` routing)
- Touch / replace: `go/cmd/vibe/iac-compile.go` (real implementation calling compiler + writer)
- Create: `go/internal/crewai/` (package for compile + exec wiring if not already from P2)
- Touch: `go/cmd/vibe/main_test.go` (add smoke for new command)
- Touch (optional): `package.json` scripts (add `"vibe:iac-compile": "cd go && go run ./cmd/vibe iac-compile ..."` convenience)
- Create: `docs/examples/crewai-out-example/` (committed golden for test) — or testdata only

### P4: Prove (end-to-end on existing surface without live crews)

**Deliverable**  
- Update the `crewai_adapter_lane` (or add a new minimal lane) in `examples/vibe-self.vibe` so that running `pnpm run self:plan && go run ./cmd/vibe iac-compile --self-plan docs/examples/vibe-self-plan.json --backend crewai --out .vibe-out/crewai` produces usable artifacts.
- Add one example `.vibe` that uses `autonomous-session` + `steps` + `persona` + `surface crewai.local` (e.g. `examples/crewai-smoke.vibe`).
- Verification commands (in lane or docs) run the compiler + static checks (python -m py_compile on generated if python present, or just file + string tests).
- Dashboard / handoff surface shows "CrewAI backend available" for the lane (no behavior change for other lanes).
- Update `docs/continue.md`, `docs/superpowers/research/2026-05-16-vibe-crewai-integration-notes.md` (add "P4 complete" status).

**Acceptance test**
- `pnpm run self:plan && pnpm run check`
- `go run ./cmd/vibe iac-compile ...` for the smoke produces files
- `go test ./...` + language tests pass
- New lane appears in `go run ./cmd/vibe lanes` output
- Golden diff or "contains Vibe IaC gate" assertions in a P4 test
- No live CrewAI / LLM execution; all static.

**Exact files to touch / create**
- Touch: `examples/vibe-self.vibe` (ensure crewai surface + one lane that can target it)
- Create: `examples/crewai-smoke.vibe` (minimal autonomous + persona + plugin for crewai)
- Touch: `docs/examples/vibe-self-plan.json` (regenerated by pnpm run self:plan — ok as part of verify)
- Touch: `docs/continue.md` (update resume note)
- Touch: `docs/superpowers/research/2026-05-16-vibe-crewai-integration-notes.md` (status)
- Create: `docs/examples/crewai-smoke-out/` (committed example output) or test fixture
- Touch: any new test that exercises P1+P3 together
- (If needed) `plugins/vibe-workbench/shared/vibe-contract.md` for adapter surface note

### P5: Harden (production quality, safety, completeness)

**Deliverable**
- Full schema roundtrip + validator additions for crewai-specific metadata (`crewai: { flow: true, humanGate: bool }`)
- Persona expansion: support/validate `goal`, `backstory`, `role` fields (update grammar docs + tests + self-plan reader if surfaced)
- Strong write-scope enforcement in generated Python (comment + optional runtime guard module)
- Gate mapping: emit real Flow `human_feedback` + Vibe gate file protocol; update devpool/gate to recognize CrewAI gates
- Error diagnostics from compiler (unknown provider for crewai, missing persona, overlapping scopes)
- Python packaging sketch (requirements + entry) + docs on "how to run the generated crew with Vibe"
- Update all handoff templates, autonomous prompts, and VS Code tree to surface backend kind
- Contract tests between TS compiler output shape and Go executor expectations
- Security: no secret emission; generated code only references env vars or Vibe-provided config
- Performance/docs: `pnpm run check`, full test matrix, contribution note in AGENTS.md

**Acceptance test**
- All prior acceptance tests + new hardening matrix:
  - Schema validate on generated manifest
  - "Bad" .vibe (missing goal persona, write overlap declared) → compiler diagnostics, non-zero or clear error
  - Golden outputs for smoke + vibe-self updated and checked in
  - `go test ./... && pnpm --filter @vibe/language test`
  - Manual review of generated crew.py for one real lane (no secrets, correct scopes, Vibe header)
- `vibe doctor` or new `vibe crewai doctor` reports python presence optionally.

**Exact files to touch / create**
- `packages/language/src/crewai/compiler.ts` + tests (add validation paths)
- `packages/language/src/generated/ast.ts` + `vibe.langium` + validators (if persona fields added)
- `schemas/vibe-self-plan.schema.json` + `vibe-lane-plan.schema.json` + contract tests (crewai extensions)
- `go/internal/lanes/coordinator.go` + prompts (if gate metadata needs new emission)
- `go/internal/devpool/gate.go` + `gate_test.go` (CrewAI gate support)
- `go/cmd/vibe/iac-compile.go` + docs
- `docs/superpowers/specs/2026-06-03-vibe-autonomous-lanes-design.md` or new crewai spec
- `plugins/vibe-workbench/shared/vibe-contract.md`
- `README.md` / `docs/local-toolkit.md` (one paragraph on crewai backend)
- New: `go/internal/crewai/` hardening files, error types, config
- `packages/language/test/validators/` additions if new rules
- Possibly `go/internal/contract/` test updates

---

## Summary & Next Move After PHASE 0

**Current state (verified):** Parser knows about CrewAI surfaces and lanes via plugins/autonomous-sessions. IRs and handoffs exist for Vibe coordination. Compiler, executor, and CLI IaC command are pure skeletons/stubs with zero implementation.

**Phase plan above is the driver.** Start with P1 (compiler in language package) — it is self-contained, testable, and produces the first concrete artifacts.

**Do not**:
- Install crewai
- Execute generated code against real LLMs in this build
- Mutate user MCP or secrets
- Commit during implementation (orchestrator verifies)

This document is the source of truth for the CrewAI IaC slice. Update it at the end of each phase with status + links to artifacts.

---
*End of PHASE 0 output.*