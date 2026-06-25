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

**Status: ✅ DONE (2026-06-24)** — commit `e977adc` on `origin/main` (FF push `ed405b7..e977adc`).

Proof:
- Files created: `go/internal/crewai/{backend,runner,backend_test}.go` (backend-neutral surface) + `go/internal/adapters/crewai/{executor,generate,executor_test}.go` (package `crewaiadapter`, the CrewAI backend). The non-compiling 16-line stub `go/internal/adapters/crewai.go` was deleted. No Go CLI / web / docs-WIP / `package.json` / `pyproject` changes; no live crew or LLM run.
- **Pluggable TargetBackend seam (B2):** `go/internal/crewai` defines `TargetBackend interface { Execute(ctx, ExecuteRequest) (ExecuteResult, error) }` plus backend-neutral `ExecuteRequest`/`ExecuteResult` and a `Runner` abstraction (`CommandRunner` mirrors `devpool/gate` exec + `*exec.ExitError` handling; `FakeRunner` is the offline test double). CrewAI is the **first** backend (`crewaiadapter.NewBackend`); a LangGraph backend (the production target later) drops in behind the same interface with **no shared call-site changes** — CrewAI is not hardcoded into the contract package.
- **Vibe primitives wrapped:** human gate (`human.before_runtime`) — a live run (`!DryRun && !ForceRun`) returns `Gated:true` with a `VIBE_GATE: human approval required …` signal and **never shells**; write-scope guard fails **loud** (returns error) on any target escaping `lane.Writes` (`filepath.Rel` + `..`-escape + prefix match); PROGRESS checkpoint/resume via the real `progress.AppendCheckpoint` after parsing the `VIBE_CHECKPOINT` marker from runner output.
- Verified (orchestrator, main tree + clean worktree off `origin/main`): `go build ./internal/adapters/crewai/... ./internal/crewai/...` exit 0; `go vet` exit 0; `go test ./internal/adapters/crewai/... ./internal/crewai/...` **6 passed** (human gate blocks live + no runner call; dry run calls runner + appends checkpoint; write-scope guard rejects out-of-scope loud; ForceRun bypasses gate but still dry + checkpoints). All offline — no python / crewai / LLM needed (`uv add crewai` skipped as unnecessary for the mocked path; pin `crewai==1.14.7` remains the P3+/runtime venv target).
- **Known pre-existing breakage (needs-Luther, NOT from this work):** `go build ./...` fails repo-wide on `go/cmd/vibe/daemon.go:1` (`expected 'package', found 'EOF'` — the file is empty/truncated) on **clean `origin/main`** as well. This is the concurrent vibe-autonomy agent's WIP / a bad prior commit, a forbidden file for this lane; left untouched.

**Next: P3 (CLI / Go wire + IaC command)** — wire `vibe iac-compile` in `main.go`/`iac-compile.go` to call the P1 compiler + this P2 executor; then **P4 (prove)** end-to-end on the existing `crewai_adapter_lane` surface without live crews.

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

**Status: ✅ DONE (2026-06-25)** — pushed to `origin/main` via isolated-worktree cherry-pick.

Proof:
- Files touched (path-scoped, Go-only): `go/cmd/vibe/iac-compile.go` (real impl, replaced the 10-line print stub), `go/cmd/vibe/main.go` (added a single `case "iac-compile", "compile"` to the `run()` switch + one usage line — `daemon`/`fanout`/`remote`/all other cases untouched), `go/cmd/vibe/main_test.go` (added `TestRunIacCompileWritesArtifacts` smoke, reusing the existing `captureStdout` + `repoFixture` helpers). No Go-internal, web, language/src, or autonomy files (`daemon.go`, `remote.go`) touched.
- `runIacCompile` parses flags `--source <file.vibe>`, `--backend crewai` (unknown backends rejected loud), `--lane <name>`, `--out <dir>` (default `.vibe-out/crewai`), then invokes the **P1 TS compiler** by shelling `node --input-type=module -e <inline ESM>` that dynamic-imports the built `packages/language/dist/index.js` and calls `compileCrewAIFromSource(source, { laneName })`, unmarshals the `CrewAICompileResult` JSON, and writes `crew.py` (+ `tools.py`/`flow.py` when present) + `manifest.json` + `vibe-contract.md` to `--out`. Fails loud if `dist` is missing (points to `pnpm --filter @vibe/language build`) or `crewPy` is empty. Live crew runs remain **gated** (the P2 executor owns `human.before_runtime`); this command is pure offline codegen.
- Verified in the worktree (on `origin/main`): `cd go && go build ./...` exit 0; `cd go && go test ./...` **all packages ok** (incl. `go/cmd/vibe` with the new smoke that actually shells node + the compiler); `go run ./cmd/vibe iac-compile --help` prints the flags. Two dry compiles produced artifacts: `examples/08-agent.vibe` → `crew.py` with `from crewai import Agent, Task, Crew` + `# Vibe IaC header` + PROGRESS reference; `examples/vibe-self.vibe --lane crewai_adapter_lane` (via the `compile` alias) → `crew.py` + **`flow.py`** (`from crewai.flow.flow import Flow, start, listen`, `@start`/`@listen`) + `human_feedback()`/`VIBE_GATE` HITL + `surface: crewai.local`. `--backend langgraph` rejected with exit 1.
- Self-plan JSON source is deferred to **P4** (the P3 `--source` path supports `.vibe` files; self-plan ingestion is the P4 prove step).

**Next: P4 — prove end-to-end on the existing self-plan surface + add a `crewai-smoke.vibe` example.**

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

**Status: ✅ DONE (2026-06-25)**

**Deliverables achieved (HARD CONSTRAINT: touched ONLY the listed areas)**
- NEW: `examples/crewai-smoke.vibe` — minimal standalone example with:
  - provider openai.gpt_5 + route resolver
  - persona smoke_voice
  - surface crewai.local { kind=framework mode=python }
  - plugin smoke_crewai_lane { target = surface.crewai.local, approval = human.before_runtime }
  - autonomous-session crewai_smoke { lanes=[{name=..., steps=[{type="checkpoint"...}, {type="self-review"...}]}], checkpoints=[...] }
- NEW static prove tests:
  - `packages/language/test/crewai/smoke-prove.test.ts` (vitest): reads the smoke .vibe, calls compileCrewAIFromSource, asserts crewPy header/import shape, Agent/role/goal/backstory, VIBE-CREWAI-BUILD-PROGRESS.md link, human_feedback + VIBE_GATE (combined), flowPy with from crewai.flow..., @start(), no _done, VIBE_CHECKPOINT, manifest personas + laneCount.
  - `go/cmd/vibe/iac_compile_smoke_test.go` (go test): calls runIacCompile directly with relative "examples/crewai-smoke.vibe" into t.TempDir(), asserts crew.py/manifest.json/vibe-contract.md written; strong strings (from crewai, role/goal, human_feedback, VIBE_GATE, Vibe IaC, VIBE_CHECKPOINT); if python present: `python -m py_compile` (or ast.parse fallback) on generated *.py files and exit 0.
- Static prove command: `cd go && go run ./cmd/vibe iac-compile --source examples/crewai-smoke.vibe --out <tmp>` then `python -m py_compile <tmp>/crew.py` (exit 0).
- Self-plan JSON source: compile path ONLY supports .vibe text (parseVibeSource + extractSelfPlan). CLI flag text mentions JSON but no ingestion added in P4. See comment in go/cmd/vibe/iac-compile.go and note below. Deferred to P5. Proven artifact path is the .vibe smoke.
- Docs: P4 status here; short "P4 complete" lines added to docs/continue.md and the 2026-05-16 research note (no other doc changes).

**Verification (must be green)**
- `cd packages/language && pnpm run build && pnpm vitest run` (only pre-existing hybrid-demo.vibe failure allowed; crewai-smoke and new smoke-prove must pass).
- `cd go && go build ./... && go test ./internal/crewai/... ./internal/adapters/crewai/... ./cmd/vibe/...`
- Static prove above + py_compile success.
- `cd packages/language && pnpm run self:plan && git status --short docs/examples/vibe-self-plan.json` → empty (smoke did not alter self-plan).

**Next:** P5 (harden).

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

### P5 status: ✅ DONE (2026-06-25) — vibe->CrewAI roadmap COMPLETE

Implemented on a clean isolated worktree at `origin/main` (`ca6d242`, the canonical P1-P4 lineage), verified green, and pushed to `origin/main` via isolated-worktree cherry-pick (autonomy WIP untouched).

- **(a) REAL HITL** — replaced the fake `human_feedback()` stub with the real CrewAI HITL API. Crew/Task path emits `Task(..., human_input=True)`; Flow path imports `from crewai.flow.human_feedback import human_feedback` and applies `@human_feedback(message=...)` on the gated step. The bare-call + fake `def human_feedback` + "# human_feedback support..." line are removed; the `VIBE_GATE` comment block is kept. **Import-shape bug fixed**: flow.py now imports what it uses (no undefined symbol). `crewai==1.14.7` pinned in the manifest + emitted `requirements.txt` + contract run notes.
- **(b) DIAGNOSTICS** — compiler pushes clear diagnostics for unknown provider (by route), persona missing a goal (CrewAI Agent requires role+goal), and overlapping write scopes. 3 new bad-input tests.
- **(c) PLUGGABLE-BACKEND seam PROOF** — `go/internal/adapters/langgraph/executor.go` + `_test.go`: `NewBackend()` satisfies the existing `crewai.TargetBackend` interface and returns a loud `"langgraph backend: not yet implemented (seam stub)"`. `vibe iac-compile --backend langgraph` routes through the seam and fails loud — proving CrewAI is **not** hardcoded. **The full LangGraph backend implementation remains a future follow-on (Luther's B2: "LangGraph as production target later").**
- **(d) SCHEMA/VALIDATION** — `crewai: { pinned: "crewai==1.14.7" }` added to the manifest; `requirements` added to `CrewAICompileResult` (emitted as `requirements.txt`); smoke/golden + iac tests updated for the new import shape, `human_input`, and the requirements file.

**Acceptance (verified):** `go build ./...` exit 0; `go test ./...` all green (23 pkgs); `pnpm -F @vibe/language build` exit 0; `pnpm -F @vibe/language test` 284 pass / 1 pre-existing unrelated fail (`hybrid-demo.vibe`); `iac-compile crewai-smoke.vibe` -> 5 artifacts + diagnostics, and generated `crew.py`/`flow.py` are **py_compile clean** with the corrected `human_feedback` import; `self:plan` unchanged.

**Roadmap status: COMPLETE.** P0 (assess) -> P1 (compiler) -> P2 (executor + pluggable seam) -> P3 (CLI wire) -> P4 (static prove) -> P5 (harden) all DONE. Remaining future follow-on (out of scope for this roadmap): the full LangGraph production backend behind the now-proven `TargetBackend` seam; live CrewAI crew execution remains gated (no install, no real-LLM runs, no secret/MCP mutation in this build).

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

---

## Stack-audit findings 2026-06-24

A stack audit of the P1 vibe->CrewAI compiler (`packages/language/src/crewai/compiler.ts`)
found two emitter bugs that made the generated Python non-importable / non-firing.
**Both are now fixed** (tests green, `tsc --noEmit` exit 0):

- **BUG-1 (fixed):** the `crew.py` ROOT import emitted `from crewai import Agent, Task, Crew, Flow`,
  but `Flow` does **not** exist at the `crewai` root — it lives at `crewai.flow.flow`
  (correctly imported separately in the Flow emission). The root import now emits
  `from crewai import Agent, Task, Crew`. Compiler test asserts the clean import and
  asserts the buggy form is absent.
- **BUG-3 (fixed):** in the Flow emission (`buildFlowPy`), each non-first lane's `@listen(...)`
  decorator chained an invented `<firstLane>_done` symbol that never exists, so flows never
  fired past step 1 (and it always chained to the *first* lane, not the predecessor). Now each
  step chains `@listen(<previous_lane_methodname>)` so steps actually run in sequence. A new
  multi-lane regression test asserts `@listen(first_lane)` and that no `_done` symbol is emitted.
  (The current self-plan exposes lanes as a flat ordered list with no fan-in graph, so linear
  predecessor chaining is correct; `or_(...)` fan-in is the right tool once multiple predecessors
  become representable.)

### Follow-ups for P2 / later

- **BUG-2 — real HITL (own PR, golden-file test):** `buildHumanGateBlock` currently emits a
  fake `human_feedback()` stub that just prints and returns `"approved"`. Replace it with the
  real CrewAI HITL API:
  - **Crew path:** `Task(human_input=True)`.
  - **Flow path:** `@human_feedback(message=...)` from `crewai.flow.human_feedback`.
  - Pin `crewai==1.14.7` in the executor venv.
  Ship this as its own PR with a golden-file test over the emitted Python.
- **B2 — pluggable target backend (P2):** generalize `CrewAICompileResult` into a pluggable
  `TargetBackend` interface (CrewAI as the first backend, **LangGraph as the production target**
  later) rather than hardcoding CrewAI throughout the compiler.