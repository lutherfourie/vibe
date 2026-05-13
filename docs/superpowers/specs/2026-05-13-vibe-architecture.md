# Vibe — top-level architecture and sequencing

**Status:** Design v4. Top-level only — per-subsystem specs come in later sessions.
**Date:** 2026-05-13
**Owner:** Luther
**Working title (previously):** Hive
**v1 → v2 delta:** folded in (a) hybrid deterministic + LLM-guided framing, (b) conversation files as valid Vibe sources, (c) `vibe init` → `.vibe/` Obsidian vault as the entry point, (d) AgentOps as prior art, (e) collapsed the standalone Vibe IDE subsystem — Obsidian is the v0 IDE.
**v2 → v3 delta:** providers gain a **mode** dimension — `api` (HTTPS) **and `cli`** (local subprocess: `claude`, `codex`, `gemini`, `grok`). CLI-mode is first-class because most consumer subscriptions (Claude.ai, ChatGPT, Google One AI Premium, SuperGrok) grant CLI access without API credits. Per-CLI lifecycle is configurable (long-lived subprocess vs one-shot per call).
**v3 → v4 delta:** added a **thin VS Code extension at v0** as a Phase 1 deliverable. VS Code is the authoring surface (syntax highlighting, diagnostics, command palette, hover-based LLM resolver preview); Obsidian remains the navigation/exploration surface for `.vibe/`. They complement, neither replaces the other. Extension lives at `vibe/packages/vscode-extension/` inside this repo.

---

## 1. Vision

**Vibe is a hybrid specification language for vibecoded ecosystems.** A real interpreted language — parser, AST, runtime, standard library — but with one defining twist: the language is **deterministic where the source is structured** (declarations, types, routing, plugin manifests) **and LLM-guided where the source is prose** (intent, vibes, design goals, conversations). The LLM resolver defaults to **Cerebras-hosted GLM** (the latest available, currently `zai-glm-4.7`) and is provider-swappable.

Providers in Vibe come in two modes. **API-mode** providers (Cerebras, OpenAI, Anthropic API, OpenRouter, LiteLLM, Google AI Studio) are called via HTTPS with an API key. **CLI-mode** providers (`claude`, `codex`, `gemini`, `grok`) are called via local subprocess — Vibe spawns the CLI, speaks its protocol, and uses **the developer's consumer subscription** for auth. CLI-mode is first-class because most vibe-coders pay for Claude.ai / ChatGPT / Google One / SuperGrok subscriptions, not API credits. Vibe routes work talks through whichever mode the developer prefers per task.

This makes three things first-class in Vibe that no existing tool unifies:

1. **A `.vibe` file can be structured syntax** (à la Pkl / Starlark / HCL).
2. **A `.vibe` file can be a markdown spec** with embedded `vibe { ... }` blocks.
3. **A `.vibe` file can be a conversation transcript** — chat turns between human and assistant — that the interpreter reads as source code, with the LLM resolver extracting deterministic outputs from the prose.

When a programmer is asked *"what languages do you code in?"* a valid answer is **"Vibe."** Vibe coders write programs the way React developers write apps: a coherent enough convention that the language earns its own name even though tool bodies underneath are still TS/Python.

### What Vibe specifies

Vibe is the **administration plane** of an LLM-authored system. You declare in Vibe:

- **Agents** — their persona, memory binding, tool permissions, triggers, role (Planner / Scout / Verifier / Worker)
- **Plugins** — collections of tools/resources/prompts with TS or Python implementations registered via FFI
- **Orchestrations** — turn lifecycle, admission gates, dispatch policy, fog-of-war on durable writes
- **Schedules** — cron-style triggers, event subscriptions
- **Spec & plan artifacts** — acceptance criteria, milestones, validation commands as first-class blocks
- **Provider bindings** — declarative routing (`route planner -> anthropic.opus-4-7; route grep -> cerebras.glm-fast`)
- **Resource economy** — reasoning budget, retrieval budget, concurrency penalty, capacity (the AgentOps Gold/Lumber/Upkeep/Supply model)

You do **not** write the imperative tool implementations in Vibe — those stay in TS or Python and are registered via FFI. Vibe handles the composition; existing languages handle the work.

### How Vibe enters a project: `vibe init`

Vibe is **initialized into existing repositories**, not bootstrapped from blank files. Running `vibe init` on a repo:

1. Performs **deterministic analysis** — git topology, branch state, hotspot detection, file inventory, AGENTS.md / CLAUDE.md / README extraction, existing plan files.
2. Runs **LLM-guided narrative extraction** (Cerebras + GLM) — clusters commits into decisions, infers intent from revert chains, extracts domain glossary, summarizes per-week activity.
3. Emits a **`.vibe/` Obsidian vault** — markdown files with `[[wikilinks]]`, navigable in Obsidian or any markdown reader, capturing the project's state, agents, decisions, plans, timeline, hotspots, glossary, and imported conversations.
4. Surfaces variance honestly — every LLM-extracted note records the model + temperature + timestamp that generated it. Re-running `vibe sync` shows the diff.

The first reference target is **GameSpree** (`c:/GameSpree`): 198 commits, 39 branches, 3 AI agent identities producing `claude/*` and `codex/*` branches, 3 historical reverts, rich uncodified vocabulary (swipe trail, ornate panel, cat presence, wave clear, fog-of-war). When `vibe init` runs cleanly on GameSpree, the design is proven against real mess.

### Why Vibe exists (the gap)

Today, LLM-authored software is a swamp of provider-specific conventions:

- `AGENTS.md` (Codex / 60K projects / LF stewardship), `CLAUDE.md` (Claude Code holdout), `MEMORY.md` (custom harnesses)
- `.codex/`, `.claude/plugins/`, `.cursorrules`, `.windsurfrules` — overlapping, incompatible structures
- Each provider's tool-call format, plan-file layout, hook vocabulary differs
- Switching from Codex to Claude (or back) means rewriting glue, not just changing an API key

The Phase 0 research ([`docs/superpowers/research/2026-05-13-codex-claude-ecosystem-survey.md`](../research/2026-05-13-codex-claude-ecosystem-survey.md)) maps every existing standardization attempt — LangChain, DSPy, BAML, LiteLLM, MCP, AGENTS.md — and shows the **project-shape × subagent × skill × hook × memory × narrative** surface is uncovered. That's the Vibe-shaped hole.

**Vibe is the unified abstraction** these tools never agreed on. Once you write a Vibe project — or have Vibe init one for you — any compliant provider runtime can author into it. Provider differences become language-level concerns the runtime handles, not concerns leaking into every project.

### What Vibe is not

- **Not a general-purpose programming language.** Bounded to administering vibecoded ecosystems.
- **Not just a config format.** Vibe has computation, types, modules, FFI, **and an LLM resolver for prose regions**. Closer to Pkl × LLM than to YAML.
- **Not a prompt framework.** LangChain abstracts prompts. Vibe abstracts a layer above — the *project* and *agent ecosystem*, not the individual LLM call.
- **Not a runtime by itself.** Vibe specifies; implementations run. The reference runtime (Izsha) is separate.
- **Not deterministic by default.** When prose is the source, output may vary across runs. Vibe **exposes variance** rather than hiding it.

---

## 2. The four subsystems

(v1 had five; the Vibe IDE collapsed — Obsidian is the v0 authoring surface, see §6.)

```text
                  ┌──────────────────────────────────────────────────┐
                  │  Vibe (language)                                 │
                  │  parser · AST · evaluator · stdlib · FFI         │
                  │  + LLM resolver (Cerebras + GLM, swappable)      │
                  │  + provider adapters (Codex / Claude / etc.)     │
                  │  + `vibe init` / `vibe sync` / `vibe build`      │
                  └──┬───────────────────────────────────────────┬───┘
                     │                                           │
                     │ FFI (TS in-process)                       │ HTTPS
                     │                                           │
                     ▼                                           ▼
        ┌──────────────────────┐                        ┌─────────────────────┐
        │  Izsha v1 (runtime)  │                        │  Spineflow          │
        │  reference agent     │                        │  the memory spine   │
        │  hosts MCP for       │                        │  Python service     │
        │  Codex + Claude      │                        │  source of truth    │
        │  drains Pawfall      │                        │                     │
        └──────────┬───────────┘                        └──────────▲──────────┘
                   │                                               │
                   │ reads / writes via stdlib                     │
                   └───────────────────────────────────────────────┘

        Author surface:  Obsidian on `.vibe/` (markdown + graph view)
        Reader surface:  `vibe build` emits AGENTS.md, .claude/, .codex/, .mcp.json
```

### 2.1 Vibe (language + resolver + adapters + init)

Vibe combines five previously-separate concerns into a single subsystem because they share the parser, evaluator, and FFI plumbing:

- **Language core.** Lexer → parser → AST → evaluator → standard library. File extension `.vibe`. Three input shapes accepted: structured syntax, markdown with embedded blocks, conversation transcripts (role-tagged).
- **LLM resolver.** Prose regions of source go through the resolver. Default: Cerebras + GLM (`zai-glm-4.7`). Swappable per route declaration. Resolutions are cached by content + model + temperature for incremental re-runs; cache invalidation is content-keyed.
- **Provider adapters.** Two modes per provider: **api** (HTTPS, API key) and **cli** (local subprocess, consumer subscription auth). Codegen targets: `AGENTS.md` (primary human-readable), `.claude/agents/*.md` + `CLAUDE.md` + `.claude/settings.json` (Claude Code), `.codex/config.toml` + `.codex/agents/*.toml` (Codex), `.mcp.json` (MCP host config), `.cursorrules` / `.windsurfrules` (IDE rules), OpenAI-compatible client config (Cerebras / OpenRouter / LiteLLM / xAI / Google AI Studio). CLI adapters wrap `claude`, `codex`, `gemini`, `grok`.
- **Init / sync / build pipeline.** `vibe init <repo>` walks the repo and emits a `.vibe/` Obsidian vault. `vibe sync` re-runs the analysis after the repo changes. `vibe build` compiles `.vibe` sources into provider artifacts (AGENTS.md, etc.).
- **Embedding strategy.** v0 ships as a TypeScript package, interpreter embedded in the Izsha Node process. Long-term option to extract a standalone Rust or Go binary once language stabilizes.

**Defers to per-subsystem spec (Phase 1):** syntax design, type system depth, error message strategy, package manager, formatter / LSP.

### 2.2 Izsha v1 (reference runtime)

The reference agent declared in Vibe, ships first with one plugin: **asset-pipeline**, which drains the Pawfall codex backlog and resolves the actual present pain.

**Owns:** runtime process that loads Vibe-declared agents, hosts MCP over stdio for Claude Code + Codex, runs the smart layer (LLM resolver double-duties here), holds the scheduler, embeds the Vibe interpreter.

**Plugins (initial):** asset-pipeline only at v1. Deploy / content / life follow as their own per-plugin specs once Izsha v1 is alive.

**Defers to per-subsystem spec (Phase 3):** plugin contract details (FFI shape, tool/resource/prompt/trigger declarations), persona format, CLI surface, Claude Code shim packaging.

### 2.3 Spineflow — the memory spine

A **Python network service** for living memory: append-only event log, knowledge graph, embedding recall, background consolidation. Already partially developed at `c:/Hive/spineflow`.

**Owns:** memory primitives consumed by Vibe agents via the Vibe stdlib (which wraps Spineflow's HTTP API). `remember` / `recall` / `tail` / graph queries.

**The AgentOps invariant** (§3): *"The memory spine is the source of truth; orchestration is not."* Orchestration (Vibe-declared agents) reads against Spineflow. Spineflow's writes go through fog-of-war confidence gating — high-fog turns block irreversible writes; medium-fog allows provisional outputs with explicit uncertainty.

**Defers to per-subsystem spec (Phase 4):** Spineflow's full architecture (graph model, decay semantics, consolidation workers, persistence layer choice, confidence model).

### 2.4 Author + read surfaces — VS Code extension + Obsidian on `.vibe/`

The shared substrate is the **`.vibe/` directory**: a valid Obsidian vault (`.obsidian/` config, markdown files, `[[wikilinks]]`) with numbered top-level folders for natural sort — `00-state`, `10-projects`, `20-agents`, `30-decisions`, `40-plans`, `50-timeline`, `60-hotspots`, `70-glossary`, `80-conversations`, `90-research`. Append-only on the human side: anything a human writes is honored on next `vibe sync`. Regenerable on the machine side: deterministic-extracted notes regenerate from source repo state; LLM-extracted notes record provenance (resolver, model, temperature, timestamp).

Two surfaces consume it. They complement, neither replaces the other:

**VS Code extension (authoring).** Lives at `vibe/packages/vscode-extension/`. v0 deliverable for Phase 1. Thin scope:

- TextMate grammar for `.vibe` syntax highlighting
- `.vibe/` tree view in the sidebar surfacing the numbered folders
- Diagnostics sourced from `vibe build` — red squiggles for parse and resolver errors
- Command palette: `Vibe: Init Project`, `Vibe: Build`, `Vibe: Sync`, `Vibe: Open Vault in Obsidian`
- **Hover-based LLM resolver preview** — hover over a prose region, popup shows resolver output + variance metadata (`resolver: cerebras.glm-4.7, t: 0.3, at: ...`). No automatic in-document overlay at v0.
- Full LSP (autocomplete, go-to-definition, hover docs) deferred to a later phase once the language stabilizes.

**Obsidian on `.vibe/` (navigation).** No code change — Obsidian opens the vault directly. Gives graph view, backlinks, search, plugins (Dataview, Tasks) for free. Used for: exploring project state, daily-notes workflow, knowledge-management.

**Future surfaces** — AgentOps (RTS-style operator console, Phase 6 candidate), a possible custom standalone Vibe IDE (Phase 6+), mobile / watch (Phase 6). All deferred. The two-surface v0 (VS Code + Obsidian) is enough.

---

## 3. Prior art — AgentOps

[`c:/Hive/AgentOps`](file:///c:/Hive/AgentOps) (`git@github.com:Vibecadex/AgentOps.git`) is a running React + Three.js + Supabase project that builds an **RTS-style control surface** for AI agent orchestration. It exists today, hand-coded, and the user described it as *"a metaphor for vibe coding and managing agents that could have been built on top of vibelang."*

**Why this matters for Vibe's design:**

- **Validates Cerebras + GLM** as the default LLM (AgentOps env: `CEREBRAS_MODEL=zai-glm-4.7`).
- **Names the architectural seam.** AgentOps' first stated invariant: *"The memory spine is the source of truth; orchestration is not."* This pins Spineflow's role in Vibe.
- **Contributes a novel resource-economy vocabulary**: Gold (reasoning budget), Lumber (retrieval budget), Upkeep (concurrency penalty), Supply (capacity). Vibe should be expressive enough to declare these as typed economy slots.
- **Provides a role taxonomy** that converges with the Anthropic harness research: Planner (hero, picks macro action and owns final answer), Scout (hero, reduces fog via retrieval), Verifier (hero, adversarial pass for high-stakes), Worker (deterministic execution). With hard constraints: planner ≠ verifier, only one planner owns final answer per turn, workers cannot self-upgrade.
- **Provides a turn lifecycle**: intent → scout/assess → admission gate → dispatch → observe → evaluate → learn. Every turn emits a typed `CommandCard` — replayable, debuggable. This is the *plan files as first-class artifacts* finding from research, named and operationalized.
- **Provides fog-of-war policy**: high-fog blocks irreversible actions + durable memory writes; medium-fog allows provisional outputs with uncertainty markup; low-fog allows normal write policy.

**Relationship to Vibe:** AgentOps stays its own project. Vibe v0 does **not** depend on or rewrite AgentOps. Spec cites AgentOps as the existence proof for Vibe-shaped concerns. Long-term (post-Izsha-v1), AgentOps is a candidate to *become* a Vibe IDE — refactored to compile from `.vibe` files — but that's deferred until both projects have stabilized.

---

## 4. Sequencing — the seven phases

Phases gate on artifacts, not dates. Each phase produces a per-subsystem spec, then implementation.

| Phase | Name | Output | Blocks |
| ----- | ---- | ------ | ------ |
| **0** | **Codex+Claude ecosystem deep research** ✅ done | [`research/2026-05-13-codex-claude-ecosystem-survey.md`](../research/2026-05-13-codex-claude-ecosystem-survey.md) | Phases 1, 2 |
| **1** | **Vibe v0 language spec + init pipeline + VS Code extension** | `specs/<date>-vibe-language-v0.md` + reference parser/interpreter + `vibe init` working on GameSpree + thin `vibe-vscode` extension (highlighting, tree view, diagnostics, commands, hover resolver preview) | Phases 2, 3 |
| **2** | **Vibe provider adapters v0** | `specs/<date>-vibe-providers-v0.md` + Codex + Claude + Cerebras adapters; `vibe build` emits AGENTS.md as primary | Phase 3 |
| **3** | **Izsha v1** | `specs/<date>-izsha-v1.md` + runtime + asset-pipeline plugin + Claude Code shim — Pawfall pain solved | nothing |
| **4** | **Spineflow v1 (formalized)** | `specs/<date>-spineflow-v1.md` with Izsha's actual usage as input | richer agent memory features |
| **5** | **Additional plugins** | Per-plugin specs: deploy / content / life | Vibe ecosystem self-administrates |
| **6** | **Dashboard, mobile PWA, watch** | Per-surface specs; possibly AgentOps becomes the Vibe IDE here | reachability beyond terminal |

**Phase 0** completed during this brainstorm.
**Phases 1–3** are the critical path to ending the Pawfall pain. Estimated 6–10 weeks of focused work combined.
**Phases 4–6** parallelize after Izsha v1 lands.

### Decision: bootstrap embed-in-TS, not standalone binary

Vibe v0 is implemented as a TypeScript package: lexer, parser, evaluator, LLM resolver, provider adapters, init pipeline. `.vibe` files are real but the runtime is a library loaded by Izsha's Node process. Working Vibe in weeks, not months. Once the language stabilizes and there's pressure to use it outside Node, extract a standalone Rust or Go interpreter. Language design must not assume the TS host — semantics stay portable.

---

## 5. Cross-cutting contracts

The five seams where subsystems meet. Each gets fleshed out in its own spec; this section commits only to the **shape** of each.

### 5.1 Deterministic ↔ LLM-resolver boundary (the hybrid seam)

A `.vibe` source has two kinds of regions:

- **Structured regions** — language syntax, typed declarations, `agent { ... }`, `route { ... }`, `plugin { ... }`. Evaluated deterministically by the AST interpreter.
- **Prose regions** — markdown paragraphs, conversation turns, free-text intent. Evaluated by the LLM resolver, which is given the prose + the project's declared primitives + Spineflow context, and asked to produce structured output (typed declarations, decision summaries, plan steps).

The boundary is *in the source*, marked by a typed harness or implicit by region kind (markdown headings, fenced code blocks tagged `vibe`, role-tagged chat turns). Resolution outputs are cached by `(content hash + resolver model + temperature)` so re-runs don't burn tokens; variance is exposed per note as `resolver: cerebras.glm-4.7, t: 0.3, at: 2026-05-13T…`.

### 5.2 Vibe ↔ runtime (language ↔ Izsha)

The Vibe interpreter exposes a small embedding API to the host runtime:

```ts
interface VibeRuntime {
  load(source: string, opts?: LoadOpts): VibeProgram;
  evaluate(program: VibeProgram, ctx: VibeContext): VibeValue;
  ffi: { registerTs(name: string, fn: TsFunction): void; /* ... */ };
  resolver: { resolve(prose: string, schema: JsonSchema): Promise<unknown>; };
}
```

Vibe-declared agents/plugins/triggers compile to runtime objects the host scheduler and MCP server consume.

### 5.3 Vibe ↔ Spineflow

Vibe's standard library wraps Spineflow's HTTP API. For v0, **in-process FFI is TS-only**; Python integration is exclusively via HTTP. Wire format and offline-degradation rules belong in Phase 4 (Spineflow spec) but the **interface stays stable** from Phase 3 onward — Izsha v1 uses a minimal Spineflow stub.

Spineflow writes are gated by **fog-of-war confidence** declared at the Vibe level:

```text
write decision into spineflow when fog <= medium with provenance required
```

### 5.4 Vibe ↔ providers

Every provider is a `ProviderAdapter` with one of two modes:

| Mode | Wire | Auth | Examples |
| ---- | ---- | ---- | -------- |
| `api` | HTTPS | API key (env var) | `cerebras.glm-4.7`, `openai.gpt-5.5`, `anthropic.opus-4-7`, `openrouter`, `litellm`, `google.gemini-2.5-pro` |
| `cli` | Local subprocess + protocol | Consumer subscription (CLI login on the dev machine) | `anthropic.claude-code`, `openai.codex`, `google.gemini`, `xai.grok` |

Declarative routing:

```text
route planner    -> anthropic.claude-code{mode: cli}        # Claude.ai subscription
route generator  -> openai.codex{mode: cli}                 # ChatGPT subscription
route narrate    -> google.gemini{mode: cli}                # Gemini CLI (needs AI Studio key)
route grep       -> xai.grok{mode: cli}                     # SuperGrok subscription
route resolver   -> cerebras.glm-4.7{mode: api}             # LLM resolver default
route evaluator  -> openai.gpt-5.5{mode: api}
fallback         -> openrouter{mode: api}
```

`vibe build` compiles routes to:

- For `api` mode → LiteLLM router config, OpenAI-compatible client setup, Claude Code subagent `model:` fields, `.mcp.json` provider blocks.
- For `cli` mode → process-supervisor declarations (which binary, which flags, lifecycle policy, IPC protocol), plus per-CLI auth bootstrapping steps in the generated AGENTS.md / CLAUDE.md.

**CLI lifecycle is per-CLI configurable.** Each adapter declares its default lifecycle and the user can override:

```text
provider anthropic.claude-code {
  mode      = cli
  lifecycle = long-lived               # one persistent subprocess per route
  binary    = "claude"
  protocol  = "claude-cli-stdio-v1"    # adapter-defined
}

provider openai.codex {
  mode      = cli
  lifecycle = short-lived              # spawn per call; simpler, slower
  binary    = "codex"
  protocol  = "codex-cli-jsonrpc"
}
```

**Why both lifecycles:** long-lived subprocesses amortize startup cost (the CLI loads models, opens MCP servers, fetches context once and reuses) but Vibe owns crash detection, context-window management, and restart policy. Short-lived is bulletproof (no state to corrupt) but slower per call. The right default depends on the CLI — Claude Code and Codex are long-lived-friendly; one-shot helpers default short.

**The subscription-vs-API caveat as a non-goal:** Vibe does NOT bridge consumer subscriptions to API credits. If a provider's CLI gates on an API key (e.g., Gemini CLI typically wants an AI Studio key, not a Google One AI Premium credential), the user obtains it through that provider's normal flow. Vibe just consumes whatever credential the CLI is configured with.

### 5.5 Izsha ↔ MCP clients (Claude Code, Codex)

Izsha hosts MCP over stdio. Plugin tools become namespaced MCP tools (`<plugin>.<tool>`). Claude Code and Codex see Izsha as a normal MCP server. Shim packaging (Claude Code plugin manifest, Codex `.mcp.json`) is Phase 3 detail.

---

## 6. Constraints & non-goals

- **Two-surface v0: VS Code extension (author) + Obsidian on `.vibe/` (navigate).** Thin VS Code extension at v0 — highlighting + tree view + diagnostics + commands + hover resolver preview. Full LSP and webview graph view defer to Phase 3+. Standalone Vibe IDE app and AgentOps-as-IDE defer to Phase 6.
- **`AGENTS.md` is the canonical human-readable build artifact.** Per Phase 0 research R9 (60K-project adoption + Linux Foundation stewardship + GitHub native rendering). Provider-specific files (`.claude/`, `.codex/`, `.mcp.json`) are machine outputs derived from the same `.vibe` source.
- **MCP is the canonical client protocol.** No proprietary protocols where MCP works.
- **No JavaScript ecosystem invention.** Vibe uses npm for distributing TS-implementation packages; no parallel package manager at v1.
- **No new authentication system.** Reuse provider API keys via env vars. Supabase auth where cloud-side identity is needed.
- **No premature performance work.** Vibe v0 is interpreted, slow, fine. Optimization waits until profiling shows real pain.
- **No mobile / watch / dashboard in v1.** Defer all frontend surfaces until at least one agent is running in production.
- **No multi-tenant.** Single-user system. Identity is the developer's machine + their Supabase account.
- **Variance is honest, not hidden.** When prose regions produce LLM-resolved output, Vibe does not pretend it's deterministic. Re-runs may differ; the difference is surfaced in the vault.

---

## 7. Success criteria

The architecture is right if, six months in:

1. **`vibe init c:/GameSpree`** runs end-to-end and produces a `c:/GameSpree/.vibe/` Obsidian vault that another developer can open in Obsidian and *understand the project from* — its sub-projects, in-flight branches, decisions, hotspots, and active agents.
2. A Vibe program declaring Izsha + the asset-pipeline plugin runs and drains the Pawfall codex backlog. The developer never wrote provider-specific glue.
3. Switching the same Vibe project from Codex to Claude (or vice versa) is a one-line provider route change, not a rewrite. `vibe build` emits the right per-provider files automatically.
4. Spineflow can be swapped between "local sqlite stub" and "Python service" with no plugin-side code changes.
5. At least one **conversation file** (a chat transcript from a brainstorming session) is a valid `.vibe` source, and its `vibe build` produces the same kind of decision/plan artifacts a hand-written `.vibe` file would.
6. AgentOps' RTS-metaphor concepts (Gold/Lumber/Upkeep/Supply economy, Planner/Scout/Verifier/Worker roles, fog-of-war write gating, CommandCard) are *expressible* in Vibe — even if AgentOps itself hasn't been refactored to use Vibe yet.

If any of those fail, the architecture as designed is wrong somewhere obvious.

---

## 8. Open questions deferred to later specs

- **Vibe syntax.** Influences: Pkl (typed config), Nix expression (functional, declarative), Starlark (Python-subset). Decision in Phase 1.
- **Markup vs syntax balance.** How aggressively do we treat plain markdown as Vibe source? Where's the line between "this is prose" and "this is a typed declaration"? Decision in Phase 1.
- **Type system depth.** Gradual typing (dynamic with optional static checks) vs strict static from day 1. Decision in Phase 1.
- **LLM resolver prompt engineering.** How are the resolver prompts constructed? How is hallucination bounded? How are typed-output JSON Schemas enforced? Decision in Phase 1.
- **Vault regeneration semantics.** When `vibe sync` re-runs against an updated repo, how does it merge with human edits to the vault? Three-way merge? Append-only? Conflict markers? Decision in Phase 1.
- **Persona spec.** Is persona a Vibe construct (`persona "coordinator, dry"`) or a runtime config Izsha consumes? Lean toward Vibe construct. Decision in Phase 3.
- **Economy primitive design.** Are Gold/Lumber/Upkeep/Supply baked in, or are they user-defined economy slots? Lean toward user-defined with AgentOps' set as a stdlib preset. Decision in Phase 3 or 5.
- **CLI protocol stability.** `claude`, `codex`, `gemini`, `grok` are all moving CLI surfaces; their stdio/JSON-RPC protocols change between versions. How does Vibe pin CLI versions, detect protocol drift, and degrade gracefully when a CLI updates? Decision in Phase 2.
- **CLI auth bootstrapping.** Each CLI authenticates differently (Claude Code uses `claude login`, Codex uses OpenAI account flow, Gemini CLI wants an AI Studio key, Grok varies). Does `vibe init` detect missing auth and walk the user through per-CLI login? Decision in Phase 2.
- **CLI lifecycle defaults.** Which CLIs default to long-lived subprocess vs short-lived per-call? Empirical question — depends on each CLI's startup cost, IPC quality, and crash behavior. Decision in Phase 2 with profiling data.
- **Cloud hosting.** Vercel + Supabase split (frontend on Vercel, Postgres+auth+storage on Supabase). Confirmed at top of Phase 6.
- **Self-hosting.** When does Vibe become implementable in Vibe? Probably not before Phase 6.

---

## 9. Repo layout (current state)

```text
github.com/lutherfourie/
├── vibe          ← THIS REPO. Language + ecosystem + specs + VS Code extension.
│   ├── docs/superpowers/{specs,research}/
│   └── packages/
│       ├── language/         # parser, AST, evaluator, stdlib, FFI, LLM resolver, init pipeline
│       └── vscode-extension/ # vibe-vscode: highlighting, tree view, diagnostics, commands
├── Hive          ← Previous working title. To be retired/redirected.
├── Izsha         ← Will become the reference agent's repo. Vibe-declared.
└── spineflow     ← Python memory spine library. Stays.

github.com/Vibecadex/
├── AgentOps      ← Prior art. RTS-style agent orchestration. Hand-coded today.
└── GameSpree     ← First `vibe init` target. Messy real project.

c:/Hive/                 ← VS Code workspace folder (not a git repo itself)
├── vibe/                ← clone of lutherfourie/vibe (THIS REPO)
├── Izsha/               ← clone of lutherfourie/Izsha (empty)
├── spineflow/           ← clone of lutherfourie/spineflow (real Python work)
├── AgentOps/            ← clone of Vibecadex/AgentOps (rich React app)
├── The-Pipe/            ← Next.js project, relationship to Vibe TBD
└── GameSpree.code-workspace
```

---

## 10. Immediate next actions

1. **Phase 0 deep research** ✅ delivered: [`docs/superpowers/research/2026-05-13-codex-claude-ecosystem-survey.md`](../research/2026-05-13-codex-claude-ecosystem-survey.md).
2. Brainstorm the **Phase 1 Vibe v0 language spec** in a new session — syntax design, evaluator architecture, LLM resolver wiring, `vibe init` pipeline. Use this top-level spec + Phase 0 research as inputs.
3. **In parallel:** continue the Pawfall TS-only Izsha-precursor (the `feat/pawfall-long-horizon-plan` branch in GameSpree) to drain the immediate codex backlog. That work is not blocked by Vibe and should not wait.
4. **Eventually (Phase 1 deliverable):** `vibe init c:/GameSpree` running end-to-end and producing a navigable `.vibe/` vault. That run is the architecture's first-mile proof.

---

*End of top-level spec v2. Per-subsystem specs follow in their own brainstorming sessions.*
