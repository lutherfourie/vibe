# Vibe v0 — language specification

**Status:** Design v1. Phase 1 spec covering language surface, semantics, file shapes, FFI, and the v0 implementation plan.
**Date:** 2026-05-13
**Owner:** Luther
**Architecture context:** [`2026-05-13-vibe-architecture.md`](2026-05-13-vibe-architecture.md) (v5, commit `086559b`).
**Library survey:** [`../research/2026-05-13-library-survey.md`](../research/2026-05-13-library-survey.md).
**Phase 0 research:** [`../research/2026-05-13-codex-claude-ecosystem-survey.md`](../research/2026-05-13-codex-claude-ecosystem-survey.md).
**Scaffold target:** [`packages/language`](../../../packages/language) and [`packages/vscode-extension`](../../../packages/vscode-extension) — both bootstrapped with Langium 4.2.4 in commit `96fb094`.

---

## 1. Scope of v0

Vibe v0 is **the smallest useful language** that lets Izsha v1 declare its first plugin (asset-pipeline), drain the Pawfall codex backlog, and prove the architecture end-to-end. Everything in this spec is committed; everything outside it explicitly defers to v0.1 or later.

**v0 ships:**

- 9 declarative primitives covering agents, plugins, tools, routes, providers, personas, memory bindings, triggers, and long-horizon harnesses
- HCL-style structured syntax + markdown-with-fenced-blocks file shape
- File-shape dispatcher layer above the parser
- LLM resolver wired through Vercel AI SDK 6 (default: Cerebras GLM 4.7)
- Inline correction model via adjacent `corrected` blocks
- Gradual typing — runtime validation always, optional static type annotations
- Convention-based FFI (`definePlugin({ ... })`) for TS plugin authors
- `vibe init`, `vibe sync`, `vibe build` CLI surface
- VS Code extension v0: highlighting, diagnostics, tree view, 4 commands, hover-based resolver preview

**v0 explicitly does NOT ship:**

- Conversation transcripts as source (v0.1)
- Strict static typing (v0.1 — gradual is the on-ramp)
- AgentOps' resource economy + role taxonomy + fog-of-war as language primitives (deferred until validated by Izsha v1's plugins)
- Webview graph view, custom IDE app, mobile / watch surfaces (Phase 6+)
- In-language RAG primitives, vector DB integration (deferred indefinitely; Spineflow handles this)
- Self-hosting (Vibe written in Vibe — Phase 6+)

---

## 2. The 9 primitives

Each primitive is a top-level declaration. Order in source is irrelevant — Vibe resolves all references after parsing.

### 2.1 `provider`

Declares an LLM provider available for routing. Two modes, both first-class.

```text
provider anthropic.claude_code { mode = cli }
provider openai.codex          { mode = cli }
provider cerebras.glm_4_7      { mode = api }
provider google.gemini         { mode = cli }
provider xai.grok              { mode = api }    // api-mode only; no Grok CLI in May 2026
```

**Grammar:** `provider <DottedId> "{" <keyValuePairs> "}"`. Dotted-id namespace is `<vendor>.<modelOrCli>` by convention. The runtime adapter is keyed by the full dotted id.

**Required fields:** `mode` (one of `cli` or `api`).

**Optional fields:** `binary` (CLI mode: the executable name; defaults to dotted-id tail), `protocol` (CLI mode: `claude-cli-stdio-v1` / `codex-jsonrpc` / `gemini-stream-json`; defaults are adapter-supplied), `lifecycle` (CLI mode: `long-lived` | `short-lived`; default per-adapter), `baseUrl` (api mode: override), `model` (api mode: explicit model id when not encoded in the dotted-id).

**Semantics:** Pure declaration — no behavior until a `route` references it.

### 2.2 `route`

Maps a logical work-name to a provider.

```text
route planner   -> anthropic.claude_code
route generator -> openai.codex
route resolver  -> cerebras.glm_4_7    // The LLM resolver default
route grep      -> cerebras.glm_4_7
fallback        -> cerebras.glm_4_7
```

**Grammar:** `route <Identifier> "->" <DottedId>` plus the special `fallback -> <DottedId>` form.

**Reserved route names at v0:**
- `resolver` — drives the LLM resolver for prose regions (REQUIRED; build fails if absent).
- `fallback` — used by the runtime when a route target is unreachable.

**User-defined route names** are arbitrary; agents reference them by string.

**Semantics:** Routes are resolved at `vibe build` time and stamped into the build outputs (AGENTS.md, `.claude/agents/*.md`, `.codex/config.toml`, etc.).

### 2.3 `plugin`

Declares a TS plugin module that contributes tools.

```text
plugin asset_pipeline {
  impl = "./plugins/asset-pipeline/index.ts"
}
```

**Grammar:** `plugin <Identifier> "{" <keyValuePairs> "}"`.

**Required fields:** `impl` (string path, relative to the `.vibe` file, pointing at the TS module).

**Semantics:** At load time, Vibe imports the module, reads its default export (a `Plugin` object — see §6 FFI), and registers all `tools` under the plugin's namespace. Tool calls in `agent` / `trigger` / orchestration blocks reference the plugin's tools as `plugin.<plugin-name>.<tool-name>` (e.g., `plugin.asset_pipeline.list_backlog`).

### 2.4 `tool`

NOT a top-level declaration at v0. Tools live inside plugins (TS-side, via `definePlugin`). The grammar reserves `tool` only as a reference path component — `plugin.<plugin-name>.<tool-name>` in expressions.

This may evolve in v0.1+ to allow inline tool declarations directly in `.vibe`, but v0 keeps the plugin-as-TS-module discipline strict.

### 2.5 `persona`

A named voice / behavior profile referenceable by agents.

```text
persona izsha_voice {
  description = "coordinator, dry, pushes back on speculative work"
  pushback    = "high"
  uncertainty = "explicit"
}
```

**Grammar:** `persona <Identifier> "{" <keyValuePairs> "}"`.

**Required fields:** `description` (string — the persona text fed into the system prompt for agents using it).

**Optional fields:** `pushback` (`low` | `medium` | `high`), `uncertainty` (`hidden` | `explicit`), `verbosity` (`terse` | `medium` | `verbose`). v0 emits all fields into the agent's resolved system prompt; runtime semantics are advisory, not enforced.

### 2.6 `memory`

A binding from a logical memory name to a Spineflow namespace.

```text
memory izsha_global {
  kind      = spineflow
  namespace = "izsha.global"
}
```

**Grammar:** `memory <Identifier> "{" <keyValuePairs> "}"`.

**Required fields:** `kind` (v0 only supports `spineflow`; reserved for v0.1: `sqlite` for local-only mode), `namespace` (string).

**Optional fields:** `on_load` (an expression invoked at agent boot — typically `recall(<query>, limit: <n>)`), `fog_threshold` (`low` | `medium` | `high` — minimum confidence to write durable values).

**Semantics:** At runtime, agents using this memory call Spineflow via the Vibe stdlib (`memory.<name>.remember(...)`, `memory.<name>.recall(...)`, `memory.<name>.tail(...)`). The Spineflow client lives in `@vibe/language` and is shared across agents in the same Izsha process.

### 2.7 `harness`

A named long-horizon-task pattern; v0 ships two recognized kinds.

```text
harness asset_drain {
  kind = planner_generator_evaluator
}

harness fast_loop {
  kind = brain_hands_session
}
```

**Grammar:** `harness <Identifier> "{" <keyValuePairs> "}"`.

**Required fields:** `kind` (enum: `planner_generator_evaluator` | `brain_hands_session`). Both names cite the Phase 0 research (Anthropic's `effective-harnesses-for-long-running-agents` and the brain/hands/session paper, respectively).

**Semantics:** When an agent declares `harness = harness.<name>`, Vibe's build step emits the corresponding scaffold files into the project's `.vibe/40-plans/` folder (`claude-progress.txt`, `feature_list.json`, `init.sh` for the planner-generator-evaluator harness; equivalent for brain/hands/session). The harness drives turn lifecycle conventions but doesn't enforce them at runtime — they're documented behavioral contracts.

### 2.8 `trigger`

A scheduled or event-driven agent dispatch.

```text
trigger every "1h" {
  do = plugin.asset_pipeline.health_check
}

trigger on "asset_pipeline.promoted" {
  do = plugin.asset_pipeline.update_manifest
}
```

**Grammar:** `trigger every <CronOrIntervalString> "{" <keyValuePairs> "}"` or `trigger on <EventName> "{" <keyValuePairs> "}"`.

**Required fields:** `do` (a tool reference; usually `plugin.<name>.<tool>`).

**Optional fields:** `when` (a guard expression — v0 supports simple comparisons against the previous result; richer conditions in v0.1+).

**Semantics:** Triggers are registered with the Izsha scheduler at agent startup. Cron syntax is human-friendly: `every "1h"`, `every "30m"`, `every "weekday 09:00"`. Event names are namespaced by plugin.

### 2.9 `agent`

The top-level orchestration unit. Composes all the above primitives.

```text
agent izsha {
  persona = persona.izsha_voice
  memory  = memory.izsha_global
  harness = harness.asset_drain
  uses    = [plugin.asset_pipeline]

  routes = {
    planner   = route.planner
    generator = route.generator
    resolver  = route.resolver
  }
}
```

**Grammar:** `agent <Identifier> "{" <keyValuePairs> "}"`.

**Required fields:** `uses` (list of plugin references).

**Optional fields:** `persona`, `memory`, `harness`, `routes` (per-agent overrides of the project-level routing table — v0.1 may extend this).

**Semantics:** An agent is a runtime composition consumed by Izsha. When Izsha starts, it loads each declared agent, wires its persona into the system prompt, opens its memory binding, sets up its harness scaffold, and exposes its plugin tools over MCP. Each agent gets its own MCP server endpoint.

---

## 3. Syntax (HCL-style structured regions)

The structured region grammar — what Langium parses — has these rules:

- **Block:** `<keyword> [name] "{" <body> "}"`
- **Assignment:** `<key> "=" <expression>`
- **Bare-arrow form (special):** `route <name> "->" <DottedId>`
- **Expression:** literal | identifier | dotted-id | list | object | function-call
- **Literal:** `true` | `false` | `null` | string (double-quoted, multi-line allowed) | number | duration (e.g., `"1h"`, `"30s"`)
- **Identifier:** snake_case, starts with letter or underscore, may contain digits
- **DottedId:** `<Identifier>("." <Identifier>)+`
- **List:** `[<expr>, <expr>, ...]`
- **Object:** `{ <key> = <expr>, <key> = <expr>, ... }`
- **Function call:** `<DottedId>(<positional>?, <key> : <value>, ...)` — used for stdlib calls like `recall(query, limit: 20)` and `spineflow(namespace: "...")`
- **Comments:** `//` (line) and `/* ... */` (block)
- **Optional type annotation:** `<key> : <Type> = <expression>` — v0 parses but runtime checks only

Numbers, duration strings, and string interpolation:
- Numbers: integer or decimal, no scientific notation at v0
- Durations: string literals matching `<n>(s|m|h|d|w)` or cron expressions in quotes
- String interpolation: `${expr}` inside double-quoted strings — v0 supports references and literals only (no full expression evaluation)

Whitespace and newlines are insignificant except inside strings.

---

## 4. File shapes at v0 (two of three)

The file-shape dispatcher classifies each `.vibe` source as one of:

### 4.1 Structured

File extension `.vibe`. Content is exclusively structured-syntax declarations. Comments allowed. The entire file goes to the Langium parser.

### 4.2 Markdown-with-blocks

File extension `.vibe` OR `.md` (when a frontmatter key `vibe: true` is present). Content is markdown prose with fenced code blocks tagged ` ```vibe `. The dispatcher:

1. Parses the markdown structure via unified/remark.
2. Extracts every fenced `vibe` block, parses it with the Langium parser, and treats each as a contribution to the project.
3. Treats prose regions (paragraphs, headings outside of vibe blocks) as **prose regions** that may be consumed by the LLM resolver when the project declares a resolver intent (e.g., when an `acceptance_criteria` or `decision` directive references the surrounding markdown).
4. Reads/writes `corrected { ... }` blocks (a special vibe-flavored block adjacent to prose) for inline corrections per §7.

### 4.3 Conversation transcripts — DEFERRED

Role-tagged chat transcripts (`user: ... / assistant: ...`) as Vibe sources defer to **v0.1**. The dispatcher will recognize them by file pattern or frontmatter when that ships.

---

## 5. File-shape dispatcher

The dispatcher is plain TypeScript inside `@vibe/language`. It does NOT live inside Langium — Langium only sees regions classified as structured.

Pipeline:

```text
source bytes
    ↓
[file-shape detector]   - inspects path, frontmatter, first non-blank chars
    ↓
shape ∈ {structured, markdown}
    ↓
[region splitter]       - emits a region stream
    ↓
region: { kind: "structured" | "prose", content: string, sourceMap: SourceLocation }
    ↓
[router]
    ↓
structured → Langium parser → AST node
prose      → resolver invocation queue
```

The router preserves source locations across regions so LSP diagnostics point at the right place in the original file.

**Open question for v0.1:** how the dispatcher detects a conversation transcript. Two candidates: a YAML frontmatter `vibe: conversation`, or pattern matching on role-tagged lines. Defer until the v0.1 spec.

---

## 6. LLM resolver

The component that turns prose regions into structured outputs.

### 6.1 Invocation model

The resolver is invoked when:

- A prose region in a markdown shape file is referenced by a vibe block that expects it (e.g., `decision = resolve_from_prose`)
- A user runs `vibe build` on a file with prose regions and the project has a `resolver` route defined
- A user runs `vibe sync` on a project, which re-resolves prose regions whose content hash has changed

The resolver is **NOT** invoked automatically on save — only on `build` or `sync`. This makes the cost model legible.

### 6.2 Underlying SDK

Vercel AI SDK 6 with the `@ai-sdk/<provider>` packages from the library survey. Routing reads the `resolver` route declared in the .vibe project. The default project template sets `route resolver -> cerebras.glm_4_7` per the architecture spec.

### 6.3 Output validation

Every resolver invocation specifies a Zod schema; the AI SDK's `generateObject` API validates the model output against it. On schema violation, the resolver retries up to 2 times with a tightened prompt; on third failure, emits a diagnostic and leaves the prose region unresolved.

**Cerebras quirk** (per library survey): `generateObject` with Cerebras GLM requires the literal word "JSON" in the prompt. The resolver wrapper injects this transparently — plugin/agent authors don't see it.

### 6.4 Caching

Resolutions are cached by `SHA-256(<prose content>) + <model id> + <temperature>`. Cache lives in `<repo>/.vibe/.cache/resolver/`. `vibe sync --clear-cache` invalidates.

### 6.5 Provenance

Every resolution stamps:

```text
resolver  = "cerebras.glm-4.7"
temperature = 0.3
at         = "2026-05-13T19:24:00Z"
hash       = "sha256:9b3c..."
```

These get written to the generated output (either inline in `corrected` blocks when corrections happen, or as YAML frontmatter on vault notes when `vibe init` builds the `.vibe/` Obsidian vault).

---

## 7. Inline corrections (`corrected` blocks)

The mechanism for users to fix bad LLM resolutions and have the fix flow back into source.

### 7.1 Shape

A `corrected` block is a vibe-syntax block adjacent to (immediately following) a prose region whose resolution was overridden by the user.

```text
The codex backlog is mostly drained. A few orphan sidecars remain.

corrected {
  resolved   = { drained = true, orphans = 7 }
  at         = "2026-05-13T19:24:00Z"
  by         = "luther"
  supersedes = "resolver:cerebras.glm-4.7@t0.3"
}
```

### 7.2 Semantics

On the next `vibe build` or `vibe sync`:

1. The dispatcher sees the prose region.
2. The router checks: is there an adjacent `corrected` block?
3. If yes — the resolver is **NOT** called; the `corrected.resolved` value is used directly.
4. If the user later edits the prose region in a way that the dispatcher detects (content hash change), Vibe emits a diagnostic asking the user to confirm: keep the correction (override the prose) or re-resolve (discard the correction). The diagnostic does NOT auto-resolve.

### 7.3 Writing back from VS Code

The VS Code extension exposes a hover action ("Override this resolution") that prompts the user for the corrected value, then writes the `corrected` block to the buffer.

### 7.4 What v0 does NOT do

- Auto-detect when an external editor changes the resolved output and infer it as a correction. v0 requires the explicit `corrected` block. Inline mid-prose corrections (`{{corrected: ...}}`) were considered and rejected as too magical.
- Merge multiple corrections to the same region (last one wins; v0.1 may layer).

---

## 8. FFI — `@vibe/language` ↔ TS plugins

### 8.1 The plugin contract

```typescript
// In plugins/asset-pipeline/index.ts
import { definePlugin } from "@vibe/language";
import { z } from "zod";

export default definePlugin({
  name: "asset_pipeline",
  version: "0.1.0",
  description: "Walks Codex sidecars and promotes assets through the registry.",

  tools: {
    list_backlog: {
      description: "Returns the current asset-promotion buckets.",
      input: z.object({}),
      output: z.object({
        buckets: z.array(z.object({
          state: z.enum(["proposed", "approved", "imported"]),
          count: z.number().int().nonnegative(),
        })),
      }),
      handler: async (_args, ctx) => {
        // ctx exposes memory, logger, llm, events, providers
        return { buckets: [/* ... */] };
      },
    },
    health_check: {
      description: "Runs `asset-registry health` and returns the verdict.",
      input: z.object({}),
      output: z.object({
        verdict: z.enum(["ok", "warn", "fail"]),
        report_path: z.string(),
      }),
      handler: async (_args, ctx) => { /* ... */ },
    },
  },

  // Optional lifecycle:
  onLoad: async (ctx) => { /* ... */ },
  onUnload: async (ctx) => { /* ... */ },
});
```

### 8.2 Discovery

When Vibe parses a `plugin asset_pipeline { impl = "./plugins/asset-pipeline/index.ts" }`:

1. Resolve the impl path relative to the .vibe file.
2. Dynamic-import the TS module (transpiled via the host TS runtime — at v0 we assume the consuming project has its own TS setup; we don't ship a compiler).
3. Read the default export — must be the result of `definePlugin()`.
4. Register tools under `plugin.asset_pipeline.<tool-name>`.
5. Validate that every tool has Zod schemas for input/output.

### 8.3 PluginContext

The `ctx` argument passed to each tool handler:

```typescript
interface PluginContext {
  logger: Logger;
  memory: MemoryClient;       // bound to the agent's memory declaration
  llm: LlmClient;             // routes through the project's `resolver` route
  events: EventBus;           // emit/subscribe across plugins
  providers: ProviderRegistry; // direct access to declared providers
}
```

Implementation details (e.g., concrete Logger/MemoryClient interfaces) live in the package's TS types, not this spec.

---

## 9. Gradual typing

v0 ships with runtime validation as the floor; optional annotations add static checks on top.

### 9.1 Runtime validation (always on)

- Every plugin tool's input and output is validated by Zod at the FFI boundary.
- Type mismatches in `.vibe` declarations (e.g., assigning a string to a number-typed field) surface as runtime errors with source-location pointers.
- The LLM resolver's structured outputs are validated by the resolver's Zod schema before being inserted into the AST.

### 9.2 Static annotations (optional)

A field declaration MAY include a type annotation:

```text
agent izsha {
  persona : Persona = persona.izsha_voice
  routes  : Map<String, Route> = { ... }
}
```

When present, the Langium-emitted LSP checks the annotation statically and surfaces violations as diagnostics in VS Code. When absent, the field is dynamically typed — runtime validation is the only check.

### 9.3 v0.1 path

Strict mode (`vibe.config: { types: "strict" }`) flips a switch to require annotations on every field. Until then, gradual is the default.

---

## 10. Implementation plan — four sub-deliverables

Per the library survey's reshaping of Phase 1:

### Sub-deliverable 1: Language v0

**Output:** complete `packages/language/src/vibe.langium` grammar + emitted parser + AST + LSP + TextMate grammar.
**Build on:** the placeholder grammar from commit `96fb094`. Grow it to cover all 9 primitives, expressions, and the gradual-typing annotation slot.
**Verification:** every primitive declared in §2 parses and roundtrips through the AST. `examples/` directory contains one canonical example per primitive plus one composite example (the v4 §1 routing block).
**Estimate:** 1–2 weeks.

### Sub-deliverable 2: File-shape dispatcher + LLM resolver

**Output:** `packages/language/src/dispatcher/`, `packages/language/src/resolver/`, the `corrected` block read/write handler, and a working `vibe build` that turns a markdown-with-blocks `.vibe` source into AGENTS.md + .claude/agents/*.md + .codex/config.toml outputs.
**Build on:** Vercel AI SDK 6, @ai-sdk/cerebras, Zod 4, unified/remark/remark-frontmatter, gray-matter, `@portaljs/remark-wiki-link`.
**Verification:** end-to-end test — author a markdown `.vibe` file with one agent + one prose region; `vibe build` produces correct AGENTS.md; user-supplied `corrected` block honored on re-build; cache hits when content hash unchanged.
**Estimate:** 2–3 weeks. **This is the biggest scratch item.**

### Sub-deliverable 3: `vibe init` analysis pipeline

**Output:** `packages/language/src/init/` with simple-git topology walker, decision-cluster narrative extractor, hotspot detector, glossary builder, and the vault writer that emits a complete `.vibe/` Obsidian vault per the architecture spec §2.4.
**Build on:** simple-git, remark, the resolver from sub-deliverable 2.
**Verification:** `vibe init c:/GameSpree` runs end-to-end and produces `c:/GameSpree/.vibe/` that opens cleanly in Obsidian, with all 10 numbered folders populated, every `[[wikilink]]` resolves, and the graph view shows meaningful structure.
**Estimate:** 2 weeks. Real-data testing on GameSpree will surface edge cases.

### Sub-deliverable 4: VS Code extension polish

**Output:** the four commands wired (`vibe.init`, `vibe.build`, `vibe.sync`, `vibe.openVaultInObsidian`), `.vibe/` tree view in the sidebar, hover provider override that shows resolver output for prose regions, status bar item showing project state.
**Build on:** the Langium-emitted LSP from sub-deliverable 1; the vault structure from sub-deliverable 3.
**Verification:** install the extension in a fresh VS Code, open `c:/GameSpree`, see `.vibe/` populated in the sidebar, run `Vibe: Build` from command palette, hover a prose region and see the resolver preview.
**Estimate:** 1 week.

**Total estimate: 6–8 weeks of focused work.**

### Sequencing

Sub-deliverables 1 → (2 ∥ 3) → 4. Sub-deliverable 2 and 3 can parallelize after the grammar lands (both depend on the AST). VS Code extension polish slots in once at least sub-deliverable 1 and the resolver scaffold from 2 are working.

---

## 11. Non-goals

- **No conversation transcripts.** v0.1.
- **No strict typing.** v0.1.
- **No AgentOps RTS-economy / role / fog primitives as language constructs.** v0 supports them via prose + resolver; promotion to first-class primitives happens after at least one Izsha plugin uses them in anger.
- **No custom IDE.** Phase 6.
- **No mobile / watch / dashboard.** Phase 6.
- **No in-language RAG / vector / embedding primitives.** Spineflow handles this through the memory binding.
- **No esbuild bundler for the extension at v0.** Plain tsc per the Path B scaffold; bundling for marketplace publish happens in v0.x.
- **No marketplace publish at v0.** Internal use only; publish at v0.x once stable.

---

## 12. Open questions deferred

- **Conversation transcript detection** — frontmatter flag vs pattern match. v0.1.
- **Per-agent route overrides** — v0 declares the routes block in `agent` but the override semantics are not fully fleshed out. v0.1.
- **Strict mode trigger** — config file? CLI flag? First field annotation? Decide in v0.1 spec.
- **Cache eviction policy** — beyond `--clear-cache`, do we LRU-evict by size? Time? Defer until pain shows up.
- **Multi-correction layering** — when a user corrects the same prose region twice, do we keep history or last-wins? Last-wins at v0; v0.1 may add history.
- **What happens when a `corrected` block's `resolved` value violates the Zod schema?** Currently undefined — error? Coerce? Fall back to fresh resolution? Decide in early implementation; spec patch when settled.

---

## 13. Success criteria

The Phase 1 spec is right if, at the end of the 6–8 week build:

1. `vibe init c:/GameSpree` runs and produces a navigable Obsidian vault at `c:/GameSpree/.vibe/`. Luther opens it in Obsidian and recognizes the project.
2. A 30-line `.vibe` file declares Izsha with the asset-pipeline plugin; `vibe build` produces an `AGENTS.md` that drains the actual Pawfall codex backlog when Codex is pointed at it.
3. Switching the same project from `route resolver -> cerebras.glm_4_7` to `route resolver -> anthropic.claude_code` requires zero changes outside that one line. `vibe build` regenerates AGENTS.md cleanly.
4. A markdown spec with embedded `vibe` blocks parses cleanly; a prose region resolves to a structured output via the resolver; the user adds a `corrected` block and `vibe sync` honors it.
5. The VS Code extension's hover preview shows resolver output with the right provenance metadata. The tree view surfaces the `.vibe/` vault folders. The four commands work end-to-end.

If any of these fail, Phase 1's design is wrong somewhere obvious.

---

*End of Phase 1 spec. Implementation plan lives separately — write-plans skill follows.*
