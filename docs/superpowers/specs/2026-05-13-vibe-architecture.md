# Vibe — top-level architecture and sequencing

**Status:** Design v1. Top-level only — per-subsystem specs come in later sessions.
**Date:** 2026-05-13
**Owner:** Luther
**Working title (previously):** Hive

---

## 1. Vision

**Vibe is a specification language for vibecoded ecosystems.** A real interpreted language — parser, AST, runtime, standard library — designed to be the unified target for LLM-authored large-system software, provider-agnostic across Codex / Claude / Cerebras / local models.

When a programmer is asked *"what languages do you code in?"* a valid answer is **"Vibe."** Vibe coders write programs the way React developers write apps: a coherent enough convention that the language earns its own name even though tool bodies underneath are still TS/Python.

### What Vibe specifies

Vibe is the **administration plane** of an LLM-authored system. You declare in Vibe:

- **Agents** — their persona, memory binding, tool permissions, triggers
- **Plugins** — collections of tools/resources/prompts with TS or Python implementations registered via FFI
- **Orchestrations** — when X happens, do Y; cross-agent flows
- **Schedules** — cron-style triggers, event subscriptions
- **Spec & plan artifacts** — the long-horizon-task harness primitives (frozen specs, milestones, validation commands) as first-class language constructs
- **Provider bindings** — which LLM provider drives which agent, with hot-swap semantics

You do **not** write the imperative tool implementations in Vibe — those stay in TS or Python and are registered via FFI. Vibe handles the composition; existing languages handle the work.

### Why Vibe exists (the gap)

Today, LLM-authored software is a swamp of provider-specific conventions:

- `AGENTS.md` (Codex), `CLAUDE.md` (Claude Code), `MEMORY.md` (custom harnesses)
- `.codex/`, `.claude/plugins/`, `.cursor/` — overlapping, incompatible structures
- Each provider's tool-call format, system-prompt convention, plan-file layout differs
- Switching from Codex to Claude (or back) means rewriting glue, not just changing an API key

**Vibe is the unified abstraction** these tools never agreed on. Once you write a Vibe project, any compliant provider runtime can author into it. Provider differences become language-level concerns the runtime handles — not concerns leaking into every project.

### What Vibe is not

- **Not a general-purpose programming language.** No need to write OS kernels in Vibe. No borrow checker. No SIMD intrinsics. Scope is bounded to administering vibecoded ecosystems.
- **Not just a config format.** Vibe has computation, types, modules, and FFI. Closer to Pkl, HCL, Starlark, or Nix expression than to YAML.
- **Not a prompt framework.** LangChain abstracts prompts. Vibe abstracts a layer above — the *project* and *agent ecosystem*, not the individual LLM call.
- **Not a runtime by itself.** Vibe specifies; implementations run. The reference runtime (Izsha) is separate.

---

## 2. The five subsystems

```text
                                    ┌──────────────────┐
                                    │  Vibe IDE        │
                                    │  (LLM-assisted   │
                                    │  spec / plan     │
                                    │  authoring)      │
                                    └────────┬─────────┘
                                             │
                                             ▼
            ┌────────────────────────────────────────────────────────┐
            │  Vibe (language)                                       │
            │  parser · AST · interpreter · stdlib · FFI             │
            │  + Vibe (ecosystem) — provider adapters                │
            └─┬──────────────────────────────────────┬───────────────┘
              │ FFI                                  │ provider adapters
              ▼                                      ▼
        ┌──────────────────┐                  ┌─────────────────────┐
        │  Spineflow       │                  │  Provider runtimes  │
        │  Python library  │                  │  Codex · Claude     │
        │  living memory   │                  │  Cerebras · local   │
        └──────────────────┘                  └─────────────────────┘
              ▲
              │ used by
              │
        ┌──────────────────┐
        │  Izsha v1        │
        │  reference agent │
        │  declared in     │
        │  Vibe, drains    │
        │  Pawfall backlog │
        └──────────────────┘
```

### 2.1 Vibe (language)

Interpreted, embedded-bootstrap-in-TS for v0, with the long-term option to extract into a standalone binary (Rust or Go) once the language stabilizes.

**Owns:** lexer, parser, AST, evaluator, standard library, type system (gradual — runtime checks first, optional static typing later), FFI to TS and Python.

**File extension:** `.vibe`.

**Defers to per-subsystem spec:** syntax design, type system depth, error message strategy, package manager design, formatter / LSP.

### 2.2 Vibe (ecosystem abstraction)

The provider-adapter layer that makes a single Vibe project portable across Codex, Claude Code, Cerebras, and local models.

**Owns:** the abstraction of agent file conventions (translates Vibe's canonical form to/from AGENTS.md, CLAUDE.md, plugin manifests, MCP configs), tool-call format normalization, prompt-caching strategy abstraction, memory/compaction primitives, provider hot-swap.

**Depends on:** Phase 0 deep research (`docs/superpowers/research/2026-05-13-codex-claude-ecosystem-survey.md`) — designs the abstraction layer with full knowledge of what each provider already does, so Vibe's primitives are honest unions, not lowest-common-denominator stubs.

**Defers to per-subsystem spec:** which conventions become first-class, which become escape hatches, how provider-specific extensions are namespaced.

### 2.3 Vibe IDE

Interactive editor with LLM-assisted authoring specifically aimed at **specifying and planning large software systems** — not just code completion. Think a working environment for the brainstorming → spec → plan → implementation flow we just lived through, formalized.

**Owns:** Vibe syntax highlighting, LSP, AST-aware refactors, an LLM-assisted spec/plan authoring surface (interactive specification companion, plan tree visualizer, milestone state tracking), integration with the host runtime so you can run Vibe programs from the editor.

**Form factor (open):** VS Code extension first (rides existing infrastructure), with a possible standalone Electron / Tauri app later. Decided in the per-subsystem spec.

**Defers:** everything. This subsystem is the latest in the sequence; do not block earlier phases on its design.

### 2.4 Spineflow

A **Python library** for living memory: event log, knowledge graph, embedding recall, background consolidation. Already partially developed at `C:\Hive\spineflow`.

**Owns:** memory primitives consumed by Vibe agents via FFI — `remember`, `recall`, `tail`, plus richer graph queries.

**Relationship to Vibe:** Spineflow is a network service Vibe talks to via HTTP. Vibe's standard library wraps Spineflow's HTTP API so agents call it as if it were native (`agent.memory.recall(...)` desugars to an HTTP request to Spineflow). For v0, **the in-process FFI is TS-only**; Python integration is exclusively via HTTP. A future Phase considers in-process Python FFI if there's pressure for it, but it's not on the v1 critical path.

**Defers to per-subsystem spec:** Spineflow's full architecture (graph model, decay semantics, consolidation workers, persistence layer choice).

### 2.5 Izsha v1

The **reference agent declared in Vibe**, ships first with one plugin: **asset-pipeline**, which drains the Pawfall codex backlog and resolves the actual present pain.

**Owns:** runtime process that loads Vibe-declared agents, hosts MCP for Claude Code + Codex, runs the smart layer (default Cerebras + GLM, swappable), holds the scheduler, embeds the Vibe interpreter (v0 bootstrap form).

**Plugins (initial):** asset-pipeline only at v1. Deploy / content / life follow as their own per-plugin specs once Izsha v1 is alive.

**Defers to per-subsystem spec:** plugin contract details (FFI shape, tool/resource/prompt/trigger declarations), smart-layer composition (per-tool opt-in), CLI surface, Claude Code shim packaging.

---

## 3. Sequencing — the eight phases

Phases gate on artifacts, not dates. Each phase produces a per-subsystem spec, then implementation.

| Phase | Name | Output | Blocks |
| ----- | ---- | ------ | ------ |
| **0** | **Codex+Claude ecosystem deep research** | `docs/superpowers/research/2026-05-13-codex-claude-ecosystem-survey.md` | Phase 1, 2 |
| **1** | **Vibe v0 language spec** | `docs/superpowers/specs/<date>-vibe-language-v0.md` + reference parser/interpreter (embed-in-TS) | Phase 2, 3 |
| **2** | **Vibe ecosystem abstraction v0** | `docs/superpowers/specs/<date>-vibe-providers-v0.md` + Codex + Claude adapters | Phase 3 |
| **3** | **Izsha v1** | `docs/superpowers/specs/<date>-izsha-v1.md` + runtime + asset-pipeline plugin + Claude Code shim | nothing — Pawfall pain solved here |
| **4** | **Spineflow v1 (formalized)** | `docs/superpowers/specs/<date>-spineflow-v1.md` (with Izsha's actual usage as input) | richer agent memory features |
| **5** | **Additional plugins** | Per-plugin specs: deploy / content / life | Vibe ecosystem self-administrates |
| **6** | **Vibe IDE v1** | `docs/superpowers/specs/<date>-vibe-ide-v1.md` + VS Code extension | better authoring loop |
| **7** | **Dashboard, mobile PWA, watch** | Per-surface specs | reachability when away from terminal |

**Phase 0 is running now** (background research agent launched 2026-05-13).

**Phase 1–3 are the critical path to ending the Pawfall pain.** Estimated 6–10 weeks of focused work for these three combined.

**Phases 4–7 are parallelizable** once Izsha v1 lands.

### Decision: bootstrap embed-in-TS, not standalone binary

Vibe v0 is implemented as a TypeScript package: lexer, parser, evaluator, FFI to TS. `.vibe` files are real but the runtime is a library loaded by Izsha's Node process. This gets us to a working Vibe in weeks, not months. Once the language stabilizes and there's pressure to use it outside Node (CLI tools, embedded in other languages), we extract a standalone Rust or Go interpreter. The language design must not assume the TS host — semantics stay portable.

---

## 4. Cross-cutting contracts

The four seams where subsystems meet. Each gets fleshed out in its own spec; this section commits only to the **shape** of each.

### 4.1 Vibe ↔ runtime (language ↔ Izsha)

The Vibe interpreter exposes a small embedding API to the host runtime:

```ts
// Conceptual — finalized in Phase 1 spec
interface VibeRuntime {
  load(source: string, opts?: LoadOpts): VibeProgram;
  evaluate(program: VibeProgram, ctx: VibeContext): VibeValue;
  ffi: { registerTs(name: string, fn: TsFunction): void; ... };
}
```

Vibe-declared agents/plugins/triggers compile to runtime objects the host scheduler and MCP server consume.

### 4.2 Vibe ↔ Spineflow

Vibe's standard library re-exports Spineflow primitives. The FFI is HTTP (Spineflow is a Python service Izsha connects to) with a local cache + write queue for offline resilience. Wire format and offline-degradation rules belong in Phase 4 (Spineflow spec) but the **interface stays stable** from Phase 3 onward — Izsha v1 uses a minimal Spineflow stub.

### 4.3 Vibe ↔ providers

Codex, Claude Code, Cerebras, and local models each look like a `ProviderAdapter`:

```vibe
// Conceptual — finalized in Phase 2 spec
provider claude {
  endpoint env.ANTHROPIC_API_KEY
  caching enabled
  capabilities { tools, prompt_caching, extended_thinking, mcp }
}
```

The runtime selects which provider drives which agent at evaluation time. Agents do not embed provider knowledge; the binding is at the project level.

### 4.4 Izsha ↔ MCP clients (Claude Code, Codex)

Izsha hosts MCP over stdio. Plugin tools become namespaced MCP tools (`<plugin>.<tool>`). Claude Code and Codex see Izsha as a normal MCP server — no special integration required. Specific shim packaging (Claude Code plugin manifest, Codex `.mcp.json`) is Phase 3 detail.

---

## 5. Constraints & non-goals

- **No JavaScript ecosystem invention.** Vibe uses npm for distributing TS-implementation packages; no parallel package manager at v1.
- **No new authentication system.** Reuse existing provider API keys via env vars. Supabase auth where cloud-side identity is needed; nothing custom.
- **No proprietary protocols where MCP works.** MCP is the canonical client-facing interface.
- **No premature performance work.** Vibe v0 is interpreted, slow, fine. Optimization waits until profiling shows real pain.
- **No mobile / watch / dashboard in v1.** Defer all frontend surfaces until at least one agent is running in production.
- **No multi-tenant.** Single-user system. Identity is the developer's machine + their Supabase account.

---

## 6. Success criteria

The architecture is right if, six months in:

1. A Vibe program declaring Izsha + the asset-pipeline plugin runs end-to-end, drains the Pawfall codex backlog, and the developer never wrote provider-specific glue.
2. Switching the same Vibe project from Codex to Claude (or vice versa) is a one-line provider declaration change, not a rewrite.
3. Spineflow can be swapped between "local sqlite stub" and "Python service" with no plugin-side code changes.
4. The brainstorming → spec → plan → implementation flow has happened **inside Vibe IDE** for at least one new plugin (deploy, content, or life).
5. At least one other developer can read a Vibe project and understand its agent structure without reading the runtime code.

If any of those fail, the architecture as designed is wrong somewhere obvious.

---

## 7. Open questions deferred to later specs

- **Vibe syntax.** Influences: Pkl (typed config), Nix expression (functional, declarative), Starlark (Python-subset). Decision in Phase 1.
- **Type system depth.** Gradual typing (dynamic with optional static checks) vs strict static from day 1. Decision in Phase 1, informed by what makes LLM authors more reliable.
- **Persona spec.** Is persona a Vibe construct (`persona "coordinator, dry"`) or a runtime config Izsha consumes? Lean toward Vibe construct for portability. Decision in Phase 3.
- **Smart-layer composition.** Per-tool opt-in vs always-on. Per-tool wins on debuggability; finalized in Phase 3.
- **Cloud hosting.** Vercel + Supabase split (frontend on Vercel, Postgres+auth+storage on Supabase). Confirmed at top of Phase 7.
- **Watch.** Real bidirectional UI vs notification-only. Almost certainly notification-only for v1 of the watch surface.
- **Self-hosting.** When does Vibe become implementable in Vibe? Probably not before Phase 6.

---

## 8. Repo layout (current state)

```text
github.com/lutherfourie/
├── vibe          ← THIS REPO. Top-level for the language + ecosystem + specs.
│   └── docs/superpowers/{specs,research}/
├── Hive          ← To be renamed or retired. Was the previous working title.
├── Izsha         ← Will become the reference agent's repo. Vibe-declared.
└── spineflow     ← Python memory library. Stays.

c:/Hive/                 ← VS Code workspace folder (not a git repo itself)
├── vibe/                ← clone of lutherfourie/vibe (THIS REPO)
├── Izsha/               ← clone of lutherfourie/Izsha
├── spineflow/           ← clone of lutherfourie/spineflow
└── GameSpree.code-workspace
```

The user has a parallel sibling clone `C:\Hive\The-Pipe/` (Next.js project) whose relationship to Vibe is currently unclassified — needs a one-line note in a future spec revision.

---

## 9. Immediate next actions

1. **Phase 0 deep research** is already running (background agent launched 2026-05-13). Report lands at `docs/superpowers/research/2026-05-13-codex-claude-ecosystem-survey.md`.
2. After research lands and is reviewed, open the **Vibe v0 language spec** brainstorm session (Phase 1).
3. In parallel: solve Pawfall's immediate problem with a minimal TS-only Izsha-precursor in the GameSpree repo (the `feat/pawfall-long-horizon-plan` branch already exists and has the coordinator script). That work is not blocked by Vibe and should not wait.

---

*End of top-level spec. Per-subsystem specs follow in their own brainstorming sessions.*
