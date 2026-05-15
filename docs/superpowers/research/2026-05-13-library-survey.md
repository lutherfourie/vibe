# Vibe — Library Survey (2026-05-13)

**Status:** Phase 1 prep research.
**Scope:** Twelve concerns identified in the [v4 architecture spec](../specs/2026-05-13-vibe-architecture.md). For each, identify the best-in-class TS-first option in 2026 and minimize scratch-authored code.
**Bias:** Pick boring, batteries-included, actively-maintained libraries. Where one library collapses two or more concerns into one (Langium, Vercel AI SDK), prefer it.

---

## TL;DR — opinionated picks

| # | Concern | Recommended | Rationale (one line) |
|---|---|---|---|
| 1 | Lexer / parser framework | **Langium ^4.2** | Collapses parser + AST + LSP + scaffolding into one TS-first toolkit; built on Chevrotain. |
| 2 | Syntax highlighting | **TextMate (Langium-emitted) for v0; tree-sitter for Phase 3+** | Langium emits TextMate for free; tree-sitter only when we need Neovim/Helix/Zed support. |
| 3 | VS Code extension scaffold | **`yo code` + esbuild bundler** (or Langium's `yo langium` if we go Langium) | Official, minimal, esbuild is now default for VS Code samples. |
| 4 | LSP framework | **Langium's LSP layer** (built on `vscode-languageserver`) | Free with Langium. No higher-level wrappers exist outside language-framework bundles. |
| 5 | LLM SDK | **Vercel AI SDK 6** as primary, with `@ai-sdk/openai-compatible` for Cerebras/xAI | One abstraction for OpenAI, Anthropic, Google, xAI, Cerebras, Groq, OpenRouter. |
| 6 | CLI providers | **`@anthropic-ai/claude-agent-sdk` + `@openai/codex` SDK + `execa`** | Official subprocess wrappers exist for Claude and Codex; shell out for Gemini/Grok via execa. |
| 7 | MCP TS library | **`@modelcontextprotocol/sdk`** | Only viable option; recently hardened (CVE fix), still the official SDK. |
| 8 | Monorepo | **pnpm workspaces + Turborepo** | Two packages don't need Nx. Turborepo gives caching + task graph for nearly free. |
| 9 | Obsidian vault generation | **Write markdown directly with `node:fs` + `remark` + `@portaljs/remark-wiki-link`** | No mature "Obsidian vault SDK." File generation is trivial; wiki-link round-tripping is the only thing worth importing. |
| 10 | Git analysis | **`simple-git`** | Shells out to native git, fastest for read-only history walking on real repos. `isomorphic-git` for any browser/in-memory work. |
| 11 | Markdown | **unified / remark** | Plugin ecosystem (wiki-link, frontmatter, MDX) wins. micromark for hot paths only. |
| 12 | Schema validation | **Zod 4** | MCP SDK requires it, Vercel AI SDK uses it natively, no compelling reason to swap. |

**The single biggest lever:** if Vibe adopts **Langium**, it eliminates roughly four scratch-authored subsystems (lexer, parser, AST, LSP) and reshapes Phase 1's deliverable list — see [§13](#13-implications-for-vibes-phase-1-plan).

---

## 1. Lexer / parser framework

### Candidates

- **[Langium](https://langium.org/)** — Eclipse-stewarded, TS-first DSL framework. Successor to Xtext. Built on Chevrotain. Provides grammar → parser → AST types → LSP → TextMate/Monarch grammar → VS Code scaffold from a single `.langium` grammar file. Version 4.2.2 (April 2026). Graduated to mature Eclipse project at v3.3 (Nov 2024).
- **[Chevrotain](https://chevrotain.io/)** — High-performance pure-TS LL(k) parser DSL. Version 12.0.0 (early 2026). Written in TypeScript, 33 KB gzipped, fault-tolerant, content-assist hooks for LSP, very fast (outperforms most hand-written parsers in JS).
- **[Lezer](https://lezer.codemirror.net/)** — LR(1)-based parser system from the CodeMirror team. Designed for incremental in-editor reparse. Compact in-memory trees. Best when CodeMirror 6 is the target editor.
- **[tree-sitter](https://tree-sitter.github.io/)** — C library with WASM and Node bindings. Incremental, error-tolerant, multi-editor (Neovim, Helix, Zed, Emacs, GitHub linguist). Grammar in JS, generated parser in C. `web-tree-sitter` runs in browsers but is "considerably slower" than native bindings.
- **[Peggy](https://peggyjs.org/)** (PEG, fork of PEG.js) — actively maintained March 2026. Solid for small DSLs, less LSP-friendly.
- **[Ohm](https://ohmjs.org/)** — User-friendly PEG. v18 beta (March 2026) "50x faster" via WASM codegen. Beautiful library; small ecosystem.
- **[nearley](https://nearley.js.org/)** — Earley-based, volunteer-maintained since 2014, slow, infrequent releases. Skip.

### Tradeoffs

| Framework | Parser | AST types | LSP | Highlighting | Scaffolding | Editor reach |
|---|---|---|---|---|---|---|
| Langium | yes (Chevrotain) | yes (TS) | yes | TextMate + Monarch | yes (yo langium) | VS Code, Monaco, any LSP-capable IDE |
| Chevrotain | yes | manual | hand-built | none | none | depends |
| Lezer | yes | yes | via CodeMirror | yes (CM6) | none | CodeMirror only |
| tree-sitter | yes | yes (CST) | manual | yes (queries) | none | Neovim, Helix, Zed, GitHub |
| Peggy | yes | manual | hand-built | none | none | depends |

Critical insight: **Langium uses Chevrotain internally**, with an ALL(*) lookahead extension. Choosing Langium does not preclude dropping to Chevrotain for edge cases — they share a runtime.

### Recommended

**[Langium ^4.2](https://github.com/eclipse-langium/langium)** for Vibe v0.

Rationale: Vibe's stated philosophy is "no JavaScript ecosystem invention" and "make use of existing suitable libraries." Langium collapses what would otherwise be four scratch-authored subsystems (lexer, parser, AST type generation, LSP server) into a single `.langium` grammar file plus thin TS hooks. Its 4.x release line is healthy, Eclipse-mature, infix-operator support is new, strict mode now requires explicit type declarations (a discipline that suits Vibe's typed-config side).

**Risks:** Langium grammars assume a context-free language structure. Vibe's "markdown with embedded `vibe { ... }` blocks" and "conversation transcript" shapes are *not* context-free at the file level. Mitigation: do file-shape detection deterministically in TS *before* dispatching to Langium for the structured-region parse. The structured region is what Langium parses; markdown/prose stays outside.

**Version pin:** `langium@^4.2.2`, `langium-cli@^4.2.2` as a dev dependency.

**Key URLs:**
- [langium.org/docs](https://langium.org/docs/)
- [GitHub eclipse-langium/langium](https://github.com/eclipse-langium/langium)
- [Langium 4.0 release notes (TypeFox)](https://www.typefox.io/blog/langium-release-4.0/)
- [Chevrotain (used internally)](https://chevrotain.io/)
- [Direct Chevrotain Usage discussion](https://github.com/eclipse-langium/langium/discussions/412) — how to escape hatch when needed

---

## 2. Syntax highlighting strategy

### Candidates

- **TextMate grammars** — native to VS Code, also used by GitHub linguist (alongside tree-sitter now), Sublime, Atom legacy. Regex-based, stateless, brittle for nested constructs. *Cheap.*
- **tree-sitter grammars** — incremental, AST-aware, queryable, portable across editors that support it. *More effort.*
- **Monarch** — VS Code's lighter-weight Monaco highlighter, similar to TextMate. Vibe doesn't need Monarch unless it ships a web playground (Phase 6+).
- **Lezer** — CodeMirror 6 only.

### 2026 consensus

Modern editor stacks (Atom transitioned, Zed/Helix/Neovim use it natively) treat tree-sitter as the "right" answer, and GitHub uses tree-sitter for syntax highlighting. **But:** for a brand-new language with one editor target (VS Code), TextMate is dramatically cheaper to produce — *especially* if your parser framework emits it for free.

### Recommended

**Phase 1: TextMate, auto-emitted by Langium.** Vibe declares the grammar once in `.langium`; `langium-cli` emits a `syntaxes/vibe.tmLanguage.json` from the same source. Zero hand-written grammar.

**Phase 3+ (after the language stabilizes): add tree-sitter for editor reach.** Hand-write a tree-sitter grammar that mirrors the Langium grammar's accepted strings. This unlocks Neovim, Helix, Zed, Emacs, and GitHub linguist. Don't do this in Phase 1 — the language design will still churn; hand-rewriting the tree-sitter grammar twice is waste.

**Risk:** Langium's TextMate output is a starting point — anyone wanting fine-grained scopes ends up hand-tuning. Plan for this; budget 1–2 days in Phase 1 to polish the emitted `.tmLanguage.json` for embedded markdown / fenced-code-block regions.

**Key URLs:**
- [Langium syntax highlighting discussion](https://github.com/eclipse-langium/langium/discussions/604)
- [tree-sitter syntax highlighting docs](https://tree-sitter.github.io/tree-sitter/3-syntax-highlighting.html)
- [HN: TextMate vs tree-sitter](https://news.ycombinator.com/item?id=35770913)
- [VS Code TextMate grammar guide](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide)

---

## 3. VS Code extension scaffolding

### Candidates

- **`yo code` (generator-code)** — Microsoft's official Yeoman generator. Emits a working TS extension with esbuild, tests, and `vsce` publish wiring. v1.6+ supports web extensions out of the box.
- **`yo langium` (generator-langium)** — Langium's generator, which produces an npm workspace containing the language package *and* a VS Code extension wired up. Default since Langium 4.0.
- **VS Code Extension Samples (`microsoft/vscode-extension-samples`)** — official sample repo with esbuild/webpack reference configs.
- **Vite** — *not recommended* for extension bundles; CJS support deprecated and removed in Vite 6. Use esbuild or tsup.

### Bundler choice

esbuild is the consensus 2026 default. The VS Code sample template moved to esbuild by default. Webpack is still supported but slower and configurationally heavier. Vite is for the *webview* side of the extension if you ship one, not the host bundle.

### Recommended

If we pick Langium: **use `yo langium`** to scaffold the whole workspace. It produces the right `packages/language` + `packages/extension` layout that matches Vibe's stated repo layout.

If we don't pick Langium: **`yo code` with esbuild bundler**.

Either way, **bundle with esbuild**.

**Version pin:** `generator-code@^1.11`, `yo@^5`, or `generator-langium@^4.2`. Esbuild `^0.25`.

**Key URLs:**
- [microsoft/vscode-generator-code](https://github.com/microsoft/vscode-generator-code)
- [Building VS Code Extensions in 2026 guide](https://abdulkadersafi.com/blog/building-vs-code-extensions-in-2026-the-complete-modern-guide)
- [Langium yo scaffold docs](https://langium.org/docs/learn/workflow/scaffold/)
- [Vite for VS Code extensions caveats](https://www.eliostruyf.com/vite-bundling-visual-studio-code-extension/)

---

## 4. LSP framework

### Candidates

- **`vscode-languageserver-node`** (Microsoft) — the canonical baseline. Packages: `vscode-languageserver`, `vscode-languageclient`, `vscode-languageserver-textdocument`, `vscode-jsonrpc`. Low-level: you implement every handler yourself.
- **Langium's LSP layer** — wraps `vscode-languageserver-node`. Auto-implements completion, go-to-definition, find references, hover, semantic tokens, formatting, document symbols, all driven from the grammar. You override only the handlers you need to customize.
- **tree-sitter + ad-hoc LSP** — there's no official tree-sitter-to-LSP bridge. You'd hand-write a server using `vscode-languageserver` and feed it tree-sitter trees. Several language ecosystems do this; none have abstracted it into a library.
- **Lezer + CodeMirror LSP plugins** — works inside CodeMirror only; not a VS Code path.

### 2026 state

No higher-level cross-framework wrappers have emerged on top of `vscode-languageserver-node`. The "higher-level" answer in 2026 is "pick a parser framework that includes an LSP layer." Langium is the standout; the alternative is hand-rolling.

### Recommended

**Langium's LSP layer.** It's the dividend of picking Langium for §1. Vibe's v0 LSP needs (per the spec) are minimal: diagnostics from parse + the LLM resolver, hover-based resolver preview, future autocomplete. All of these slot into Langium's existing extension points without writing protocol-level code.

The **hover-based LLM resolver preview** mentioned in the spec is the only handler with novel logic — Vibe overrides Langium's `HoverProvider` with one that, for prose regions, returns the cached resolver output + provenance string. That's a 50-line override, not a server.

**Key URLs:**
- [Langium LSP docs](https://langium.org/docs/learn/workflow/lsp/)
- [microsoft/vscode-languageserver-node](https://github.com/microsoft/vscode-languageserver-node)
- [Language Server Extension Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)

---

## 5. LLM SDK strategy

Vibe must call: **Cerebras (default), OpenAI, Anthropic API, Google AI, xAI**, with **OpenRouter** as a fallback aggregator and **LiteLLM** as an optional self-hosted gateway.

### Candidates

- **[Vercel AI SDK 6](https://ai-sdk.dev/)** (`ai` + `@ai-sdk/*` provider packages) — 20M+ weekly downloads, native agent abstraction in v6, generateText/streamText/generateObject/streamObject as the core surface. 25+ first-party providers including Anthropic, OpenAI, Google, xAI Grok, Bedrock, Groq, **and** an `@ai-sdk/openai-compatible` shim for anything that speaks OpenAI's wire format (Cerebras, LiteLLM, OpenRouter, vLLM, Together, Fireworks). Provider-agnostic by design: swap models with a one-line change.
- **Official per-vendor SDKs** (`@anthropic-ai/sdk`, `openai`, `@google/genai`, `xai-sdk`) — each handles its own provider only. Best when you want the exact native API surface (e.g., Anthropic's prompt caching headers, Google's `Interactions API`). Forces you to write provider-routing logic yourself.
- **LangChain JS** — heavier, slower-evolving, more orchestration concerns than Vibe wants at the SDK layer. 101 KB gzipped, doesn't fit edge. Skip for the SDK layer; reconsider if Vibe ever needs RAG orchestration at the application layer (it doesn't — the architecture spec explicitly puts that work in Spineflow / Izsha plugins, not the language core).
- **LiteLLM** — Python proxy. Vibe can deploy it as a sidecar gateway if a user wants unified billing/key-management, but Vibe's TS code should *not* depend on it. From TS you point any OpenAI-compatible client at the LiteLLM proxy URL — that's all the integration needed. LiteLLM also has known security history (RCE chain disclosed in 1.83.x line); pin to fixed versions when used.
- **OpenRouter** — accessed via `@ai-sdk/openai-compatible` or via official OpenRouter packages. Useful fallback, not a primary.

### Cerebras specifics

- Cerebras has an OpenAI-compatible endpoint at `https://api.cerebras.ai/v1` and also dedicated Python/TS SDKs.
- The Vercel AI SDK has a first-party **[`@ai-sdk/cerebras`](https://ai-sdk.dev/providers/ai-sdk-providers/cerebras)** package and Cerebras documents it.
- **Known gotcha:** `generateObject` on Cerebras can fail because Cerebras's structured-mode requires the literal word "JSON" in the prompt. Worth knowing for the LLM resolver — when targeting Cerebras for typed output, add a JSON instruction marker or fall back to tool-call structured output.

### Recommended

**Vercel AI SDK 6 as Vibe's primary LLM abstraction**, with:

- `@ai-sdk/anthropic` for Anthropic API
- `@ai-sdk/openai` for OpenAI
- `@ai-sdk/google` for Google AI Studio / Vertex
- `@ai-sdk/xai` for Grok
- `@ai-sdk/cerebras` for the Vibe default LLM resolver
- `@ai-sdk/openai-compatible` for OpenRouter and any self-hosted LiteLLM proxy
- `zod` for `generateObject` schemas

This collapses the spec's §2.1 "provider adapters" surface for API-mode providers into one library. The CLI-mode providers (§6 below) are a separate problem and stay separate.

**Version pin:** `ai@^6`, `zod@^4`. Provider packages match the `ai` major.

**Key URLs:**
- [AI SDK home](https://ai-sdk.dev/)
- [AI SDK 6 blog](https://vercel.com/blog/ai-sdk-6)
- [@ai-sdk/cerebras](https://ai-sdk.dev/providers/ai-sdk-providers/cerebras)
- [Cerebras OpenAI compatibility](https://inference-docs.cerebras.ai/resources/openai)
- [LiteLLM proxy](https://docs.litellm.ai/docs/simple_proxy)
- [Vercel AI SDK vs LangChain 2026](https://strapi.io/blog/langchain-vs-vercel-ai-sdk-vs-openai-sdk-comparison-guide)

---

## 6. CLI-as-provider wrapping

This is the most architecturally distinctive concern in the spec — CLI-mode providers using consumer subscriptions. State of the art in 2026:

### Claude — `claude` CLI

**[`@anthropic-ai/claude-agent-sdk`](https://github.com/anthropics/claude-agent-sdk-typescript)** is the official wrapper. v0.2.140 (mid-May 2026), 108 releases. Important:

- It **bundles the `claude` binary** as a per-platform optional npm dependency. Users don't install Claude Code separately.
- Under the hood: spawns the bundled binary as a subprocess and communicates over **NDJSON on stdio** (confirmed via the Go SDK docs, which is the most explicit about wire format).
- Supports a `cli_path` override if a user has their own `claude` install.
- Auth: uses **whatever auth the CLI itself is configured with** — `claude login` from the user's terminal sets the credentials the SDK then inherits. This is exactly the "consumer subscription" path Vibe's spec requires.
- V2 preview TypeScript API drops async generators in favor of `send()` / `stream()` per turn — easier to adopt.
- "Warm start" pattern: `startup()` boots the subprocess on app boot so the first `.query()` has no spawn latency.

### Codex — `codex` CLI

OpenAI ships an experimental **[Codex TypeScript SDK](https://developers.openai.com/codex/sdk)** that controls the local Codex app-server over **JSON-RPC**. For Node 18+. There's also non-interactive mode: `codex exec --json` produces JSON Lines, suitable for ad-hoc subprocess invocation. JSON Schema output via `--output-schema` for typed results.

Maps cleanly to Vibe's `protocol = "codex-cli-jsonrpc"` example in the spec.

### Gemini — `gemini` CLI

[google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) is open source. **No first-party SDK for programmatic control yet** (as of May 2026); a Python SDK was proposed Feb 2026 with two implementation paths (subprocess wrapping `--output-format stream_json`, or a native reimplementation atop `google-genai`). No TS equivalent at this writing.

Practical path: shell out to `gemini --output-format stream_json "..."` via execa and consume the NDJSON. Or just call the underlying `@google/genai` library directly when API-mode is acceptable.

### Grok — `grok` CLI

**xAI does not ship an official CLI.** [`superagent-ai/grok-cli`](https://github.com/superagent-ai/grok-cli) is the de facto community option. **Grok Build** has been teased since January 2026 but not publicly released as of late April. So this is the riskiest CLI to commit to. Realistically:

- For Vibe v0–v2, treat Grok as **API-only via the official `xai-sdk` or OpenAI-compatible client pointed at `api.x.ai`** (xAI's recommended path).
- If Grok Build ships before Phase 2, add a CLI adapter then.

### Generic subprocess libraries

- **[execa](https://github.com/sindresorhus/execa)** — battle-tested, full-featured: scripts, template strings, sync, IPC, graceful kill, file/binary IO, verbose mode. Larger.
- **[nano-spawn](https://github.com/sindresorhus/nano-spawn)** — same maintainer, smaller, no dependencies, but lacks IPC, sync, file IO, advanced piping. Fine for one-shot commands; **not** fine for the long-lived bidirectional NDJSON conversations Vibe's CLI adapters need.
- **tinyspawn** — minimal, less mature than nano-spawn.

### Recommended

For **CLI providers in Vibe v0–v2**:

| Provider | Strategy |
|---|---|
| `anthropic.claude-code` | `@anthropic-ai/claude-agent-sdk` (official, NDJSON over stdio, bundled binary) |
| `openai.codex` | `@openai/codex` SDK (official, JSON-RPC) or `codex exec --json` via execa for short-lived |
| `google.gemini` | `execa` wrapping `gemini --output-format stream_json` until a TS SDK ships |
| `xai.grok` | **defer to API-mode via `xai-sdk` / OpenAI-compatible client; revisit if Grok Build ships** |

For everything else needing subprocess control, **use `execa@^9`**.

This means Vibe v0 needs to author exactly **one** custom subprocess adapter (Gemini), with a Grok placeholder for later. Claude and Codex come for free.

**Key URLs:**
- [Claude Agent SDK GitHub](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Claude Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- [OpenAI Codex SDK](https://developers.openai.com/codex/sdk)
- [Codex non-interactive JSON mode](https://developers.openai.com/codex/noninteractive)
- [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli)
- [Gemini CLI Python SDK proposal](https://github.com/google-gemini/gemini-cli/issues/20672)
- [superagent-ai/grok-cli (community)](https://github.com/superagent-ai/grok-cli)
- [xAI Release Notes](https://docs.x.ai/developers/release-notes)
- [execa](https://github.com/sindresorhus/execa)

---

## 7. MCP library for TypeScript

### State

**[`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)** is the official SDK and remains the only viable choice for TS. There is no compelling community alternative (FastMCP exists, primarily Python-focused; TS forks are niche).

2026 highlights:
- Full MCP spec coverage: resources, prompts, tools, sampling, form elicitation.
- Standard transports: stdio + Streamable HTTP.
- **Required peer dependency on Zod** (uses Zod 4 internally; accepts Zod 3.25+ for backward compat).
- Breaking changes in recent releases: `experimental.tasks.getTaskResult()` no longer takes `resultSchema`; deprecated schema helpers removed in favor of `standardSchemaToJsonSchema` / `validateStandardSchema`.
- **CVE-2026-0621 fixed** — ReDoS in URI template regex; pin to the latest patched version.

### Recommended

**`@modelcontextprotocol/sdk@^latest-patched`** for both the server side (Izsha hosts MCP for Claude/Codex consumers) and the client side (Vibe-driven tools calling out).

Couple it with **Zod 4** (see §12). Don't try to abstract over Standard Schema yet; the MCP SDK still strongly prefers Zod natively.

**Key URLs:**
- [MCP TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk)
- [Releases](https://github.com/modelcontextprotocol/typescript-sdk/releases)
- [Speakeasy: MCP TypeScript SDKs for the Agentic AI ecosystem](https://www.speakeasy.com/blog/release-model-context-protocol)

---

## 8. Monorepo tooling

### Candidates

- **pnpm workspaces** — built-in, fast, deterministic, no caching/task-graph.
- **Turborepo** — pairs naturally with pnpm; adds task graph, content-aware caching, remote caching. Vercel-maintained, lightweight to adopt.
- **Nx** — heavier, more opinionated, has generators, dependency-graph affected-detection, polyglot support. Pays off above ~20 packages or polyglot stacks.
- **Bun workspaces** — viable but Vibe's CI / ecosystem assumptions are Node-centric; stick with pnpm.

### 2026 consensus for two-package monorepos

`pnpm workspaces` alone is sufficient at this scale. Add Turborepo only when (a) the task graph gets non-trivial (lint + build + test + generate-grammar order matters) or (b) you want remote caching. With Langium's `langium:generate` step before `tsc`, the task graph is already non-trivial enough to justify Turborepo from day one.

### Recommended

**pnpm workspaces + Turborepo.** Skip Nx — overkill for two packages, and its generators conflict philosophically with letting Langium own scaffolding.

Workspace structure already pinned by the spec:

```
packages/
  language/         # parser, AST, evaluator, stdlib, FFI, LLM resolver, init pipeline
  vscode-extension/ # vibe-vscode
```

**Version pin:** `pnpm@^10`, `turbo@^2.x`.

**Key URLs:**
- [Turborepo docs](https://turborepo.com/docs)
- [Monorepo Tools 2026 (Turborepo vs Nx vs Lerna vs pnpm)](https://viadreams.cc/en/blog/monorepo-tools-2026/)
- [pkgPulse: Turborepo vs Nx 2026](https://www.pkgpulse.com/guides/turborepo-vs-nx-monorepo-2026)

---

## 9. Obsidian-vault generation libraries

### State

There is **no mature "Obsidian vault SDK"** for Node. The official Obsidian-MD CLI is recent (early 2026, insiders), and [`obsidian-ts`](https://github.com/kitschpatrol/obsidian-ts) wraps it — but it's pre-1.0 and aimed at *automating an Obsidian app instance*, not at generating vaults from cold.

Vibe's need is the inverse of that: emit a directory of markdown that *happens to be* a valid Obsidian vault when opened. That's purely a question of:

1. Writing markdown files in the right folder structure.
2. Using `[[wikilink]]` syntax (which is just text).
3. Optionally seeding a `.obsidian/` directory with basic config.

All three are file-system operations. There's no library worth depending on for items 1 and 3. For item 2 — *parsing* wikilinks during `vibe sync` to know which notes reference which — there are remark plugins worth using.

### Useful pieces

- **[`@portaljs/remark-wiki-link`](https://www.npmjs.com/package/@portaljs/remark-wiki-link)** — parse `[[link]]` and `![[embed]]` syntax during markdown processing.
- **[`flowershow/remark-wiki-link`](https://github.com/flowershow/remark-wiki-link)** — alternative with permalink mapping.
- **`gray-matter`** — frontmatter parsing for the YAML headers Vibe will use to record `resolver:`, `temperature:`, `at:` provenance.
- **`fast-glob`** — vault file discovery during `vibe sync`.

### Recommended

**Write the vault by hand with `node:fs` + `node:path`.** Use **`@portaljs/remark-wiki-link`** for parsing existing wikilinks during sync; **`gray-matter`** for frontmatter; **`fast-glob`** for traversal. Build a small `VaultWriter` class in `packages/language/src/vault/` — this is one of the few areas where scratch code is genuinely warranted, but the surface is small (write markdown file, ensure parent dir, render frontmatter).

Do **not** depend on `obsidian-ts` — it's pre-1.0 and assumes a running Obsidian app, which Vibe explicitly does not require.

**Key URLs:**
- [@portaljs/remark-wiki-link](https://www.npmjs.com/package/@portaljs/remark-wiki-link)
- [flowershow/remark-wiki-link](https://github.com/flowershow/remark-wiki-link)
- [kitschpatrol/obsidian-ts](https://github.com/kitschpatrol/obsidian-ts) (informational; do not depend)

---

## 10. Git history analysis

Vibe's read-only use case: walk commits, parse messages, detect reverts, infer branch topology, list files per commit. Performance matters on GameSpree-scale (198 commits, 39 branches) but the GameSpree repo is *small* in git terms.

### Candidates

- **[simple-git](https://www.npmjs.com/package/simple-git)** — thin wrapper over the native `git` CLI. v3+ ships ESM + CJS + bundled types. Fast (because git is fast). Requires git in PATH.
- **[isomorphic-git](https://isomorphic-git.org/)** — pure JS reimplementation. Runs in browsers, Node, anywhere. Slower than native git on large repos. Has a `walk` API for tree comparison, memoization, LightningFS for in-memory filesystems.
- **[nodegit](https://github.com/nodegit/nodegit)** — native libgit2 bindings. Fastest, but native compilation hassles on Windows/macOS, and the project's maintenance cadence has been uneven for years.

### Recommended

**`simple-git`** for Vibe's `vibe init` / `vibe sync` analysis pipeline. Reasons:

- Vibe assumes a developer machine with `git` already installed (it's running on a real repo).
- Speed: native git is faster than any JS reimplementation for log walks, diffs, revert detection.
- API stability: `simple-git` is older, calmer, and TypeScript-typed.

**Keep `isomorphic-git` in reserve** *only* if Vibe ever needs to do git analysis in a browser context (a future hosted dashboard, say). That's a Phase 6 question, not Phase 1.

**Version pin:** `simple-git@^3.x`.

**Key URLs:**
- [simple-git npm](https://www.npmjs.com/package/simple-git)
- [steveukx/git-js](https://github.com/steveukx/git-js)
- [isomorphic-git](https://isomorphic-git.org/)
- [isomorphic-git walk](https://isomorphic-git.org/docs/en/walk)

---

## 11. Markdown processing

Vibe processes markdown in three places: parsing user-authored `.vibe` markdown sources, reading existing `AGENTS.md` / `CLAUDE.md` / `README.md` during init analysis, and round-tripping vault markdown during sync.

### Candidates

- **unified + remark / remark-parse / mdast-util-*** — AST-based, pluggable, *huge* plugin ecosystem (wiki-link, frontmatter, MDX, GFM, footnotes). The right answer for transformation pipelines.
- **micromark** — low-level CommonMark engine that powers remark under the hood. Faster but raw. Use only for hot paths where remark's overhead is measurable (rarely the case at Vibe's scale).
- **markdown-it** — renderer-style, plugin-friendly, very fast HTML output. Wrong shape for transformation work; right for one-shot HTML rendering.
- **marked** — fastest for naive HTML conversion. No AST. Not appropriate.

### Recommended

**unified + remark**, with:

- `remark-parse` / `remark-stringify` for the AST round-trip.
- `remark-frontmatter` for the `--- ... ---` YAML headers Vibe uses for provenance.
- `@portaljs/remark-wiki-link` for `[[wikilinks]]` (see §9).
- `remark-gfm` for tables, task lists, strikethrough — both `AGENTS.md` and `CLAUDE.md` in the wild use GFM features.

Avoid MDX in Vibe v0 — it adds JSX semantics Vibe doesn't need.

**Version pin:** `unified@^11`, `remark-parse@^11`, `remark-stringify@^11`, `remark-frontmatter@^5`, `remark-gfm@^4`.

**Key URLs:**
- [unified](https://unifiedjs.com/)
- [remark](https://github.com/remarkjs/remark)
- [micromark](https://github.com/micromark/micromark)
- [pkgPulse marked vs remark vs markdown-it 2026](https://www.pkgpulse.com/guides/marked-vs-remark-vs-markdown-it-parsers-2026)

---

## 12. Schema validation for LLM-resolver outputs

### Candidates

- **[Zod 4](https://zod.dev/)** — battle-tested, the dominant TS schema library, native interop with both Vercel AI SDK (`generateObject`) and `@modelcontextprotocol/sdk`. v4 (mid-2025) addressed the perennial bundle-size and perf complaints somewhat; still bigger than alternatives.
- **[Valibot](https://valibot.dev/)** — functional, tree-shakable, ~90% smaller bundle than Zod. Good for browsers/edge. Slightly less mature ecosystem.
- **[ArkType](https://arktype.io/)** — TypeScript-literal-syntax-based, fastest at runtime (3-4x Zod), but bigger bundle than both Valibot and Zod-Mini.
- **[TypeBox](https://github.com/sinclairzx81/typebox)** — JSON Schema-first, used heavily in Fastify; better when you need raw JSON Schema as the source of truth (e.g., to send to an LLM that expects JSON Schema natively).

### Standard Schema

The **Standard Schema** spec (~60-line TS interface) lets Zod/Valibot/ArkType interop with framework code. MCP's SDK partially supports it but still strongly prefers Zod. Vercel AI SDK supports Standard Schema in v6.

### Vibe's specific need

The LLM resolver returns structured output validated against a schema. That schema gets serialized into either:
- A JSON Schema passed to a provider's structured-output mode (OpenAI, Google).
- A tool-call signature passed to a provider's tool-use mode (Anthropic).
- A grammar/regex constraint for local models.

All three paths benefit from **Zod 4** because:
- Both the Vercel AI SDK (§5) and MCP SDK (§7) take Zod natively without adapters.
- `zod-to-json-schema` is mature for cases where raw JSON Schema is required.
- Vibe's schemas are server-side TS, not bundled to the browser, so Zod's bundle size doesn't matter.

### Recommended

**Zod 4.** Skip Valibot/ArkType — the bundle-size argument doesn't apply server-side, and adopting either of them forces conversion adapters when talking to the MCP SDK and AI SDK.

**Version pin:** `zod@^4.x`.

**Key URLs:**
- [Zod docs](https://zod.dev/)
- [Zod vs Valibot vs ArkType 2026 (PkgPulse)](https://www.pkgpulse.com/guides/zod-vs-arktype-2026)
- [Pockit: Zod vs Valibot vs ArkType in 2026](https://pockit.tools/blog/zod-valibot-arktype-comparison-2026/)
- [Standard Schema spec](https://github.com/standard-schema/standard-schema)

---

## 13. Implications for Vibe's Phase 1 plan

The Phase 1 deliverable list (from the v4 architecture spec, §4 table):

> Phase 1: Vibe v0 language spec + init pipeline + VS Code extension
> Output: `specs/<date>-vibe-language-v0.md` + reference parser/interpreter + `vibe init` working on GameSpree + thin `vibe-vscode` extension (highlighting, tree view, diagnostics, commands, hover resolver preview)

Compare that against what the libraries above provide for free:

### Items that effectively disappear with the right library choice

| Phase 1 deliverable | Scratch path | Library path | Savings |
|---|---|---|---|
| Lexer | hand-write in TS | Langium grammar | weeks |
| Parser | hand-write recursive descent | Langium grammar | weeks |
| AST types | hand-write TS interfaces | langium-cli emits | days |
| TextMate grammar | hand-write `.tmLanguage.json` | langium-cli emits | days |
| Monarch grammar (Monaco) | hand-write | langium-cli emits | days |
| LSP server (diagnostics) | implement via `vscode-languageserver` | Langium's built-in `ValidationRegistry` | days |
| LSP hover handler | implement via `vscode-languageserver` | override Langium's `HoverProvider` | hours |
| Workspace/file tracking | implement | Langium's `WorkspaceManager` | days |
| VS Code extension scaffold | yo code + glue | yo langium emits both packages wired up | day |
| API LLM client (5 providers) | per-provider | Vercel AI SDK + provider packages | weeks |
| CLI provider for Claude | hand-spawn + parse stdout | `@anthropic-ai/claude-agent-sdk` | week |
| CLI provider for Codex | hand-spawn + parse stdout | `@openai/codex` SDK | week |
| MCP host | hand-implement protocol | `@modelcontextprotocol/sdk` | weeks |
| Markdown AST + frontmatter | hand-parse | unified + remark + gray-matter | days |
| Git log walk | hand-parse `git log` text | simple-git | day |
| Schema validation | hand-write | Zod | day |

**Aggregate:** the library stack above eliminates **roughly 8–12 weeks of scratch implementation** from Phase 1, mostly concentrated in the parser/AST/LSP block. That aligns the original Phase 1+2+3 combined estimate (6–10 weeks) with reality — *if* Langium is adopted.

### Items still scratch-authored in Phase 1

These are the irreducible Vibe-specific surfaces:

1. **Evaluator / interpreter** — Langium gives you the AST; you still walk it. Vibe's evaluator is novel (hybrid deterministic + LLM-guided regions, FFI). No library replaces this.
2. **LLM resolver** — orchestrates cached resolution of prose regions, builds provider-specific prompts, threads provenance through to vault frontmatter. Uses Vercel AI SDK underneath but the resolver logic itself is Vibe-specific.
3. **Provider routing language** — the `route planner -> anthropic.claude-code{mode: cli}` syntax. This is a small DSL *inside* Vibe, parsed by the Langium grammar. The runtime that maps a route to an adapter is scratch.
4. **`vibe init` analysis** — orchestrates simple-git + unified + LLM resolver to build the vault. Scratch business logic, but each underlying primitive is a library call.
5. **Vault writer** — emits markdown files into `.vibe/` with the right frontmatter, wikilinks, folder structure. Scratch but small (~300 LOC).
6. **Conversation-file recognizer** — detecting role-tagged chat turns and feeding them to the resolver. Vibe-specific format heuristic. Scratch.
7. **Gemini CLI adapter** — until Google ships a TS SDK, this is execa-wrapped JSON parsing. Roughly 200 LOC.
8. **VS Code tree view, command palette commands, hover provider override** — gluing Langium + Vibe's vault state into the VS Code UI. Standard extension code, ~500 LOC.

### Should Phase 1 be reshaped?

**Yes, in one specific way:** the spec frames Phase 1 as "language + init pipeline + extension" as if they're three roughly equal pieces. With Langium adopted, the **language plumbing collapses to a grammar file + scaffolded LSP** in week 1. The remaining effort is concentrated in:

1. **Evaluator / interpreter design + implementation** (the biggest scratch item).
2. **LLM resolver** (Vercel AI SDK + Zod + prompt orchestration + caching).
3. **`vibe init` analysis** on GameSpree (real-data driven; will reveal edge cases).
4. **VS Code extension polish** (tree view + commands + hover preview).

I recommend the Phase 1 spec frame those as the four sub-deliverables, treat Langium adoption as a prerequisite decision in the first week, and budget the rest of Phase 1 around the evaluator + resolver + init pipeline. The "thin VS Code extension" can be slotted as a deliverable that overlaps the back third of Phase 1 because Langium produces 80% of it from the grammar.

### One sharp tradeoff to surface

**Markdown sources and conversation transcripts are not LL(k).** Langium-the-parser is suited for the structured-region grammar. The *file-shape dispatcher* — "is this file a structured `.vibe`, a markdown spec with `vibe { ... }` blocks, or a conversation transcript?" — should sit *above* Langium, in plain TS, and slice the file into regions that are then individually parsed (structured regions by Langium, prose regions by the resolver). This is a clean architectural seam the spec already implies in §5.1 ("the boundary is *in the source*").

If for some reason Langium turns out to be a bad fit (the grammar gets uglier than expected for Vibe's specific syntax — say, significant whitespace, custom operators, or complex string interpolation rules), the fallback is **Chevrotain directly**. That's a calm path because Langium is built on Chevrotain — moving down a layer doesn't change the runtime, only loses scaffolding. This is the right hedge.

### Final library stack for Phase 1 `package.json` (sketch)

```jsonc
// packages/language
{
  "dependencies": {
    "langium": "^4.2.2",
    "vscode-languageserver": "^9",
    "vscode-languageserver-textdocument": "^1",
    "ai": "^6",
    "@ai-sdk/cerebras": "^1",
    "@ai-sdk/anthropic": "^1",
    "@ai-sdk/openai": "^1",
    "@ai-sdk/google": "^1",
    "@ai-sdk/xai": "^1",
    "@ai-sdk/openai-compatible": "^1",
    "@anthropic-ai/claude-agent-sdk": "^0.2",
    "@openai/codex": "^latest",       // TypeScript SDK from OpenAI Codex
    "@modelcontextprotocol/sdk": "^latest-patched",
    "zod": "^4",
    "execa": "^9",
    "simple-git": "^3",
    "unified": "^11",
    "remark-parse": "^11",
    "remark-stringify": "^11",
    "remark-frontmatter": "^5",
    "remark-gfm": "^4",
    "@portaljs/remark-wiki-link": "^latest",
    "gray-matter": "^4",
    "fast-glob": "^3"
  },
  "devDependencies": {
    "langium-cli": "^4.2.2",
    "typescript": "^5.6",
    "tsup": "^8",
    "vitest": "^2"
  }
}

// packages/vscode-extension
{
  "dependencies": {
    "vscode-languageclient": "^9"
  },
  "devDependencies": {
    "@types/vscode": "^1.95",
    "esbuild": "^0.25",
    "@vscode/vsce": "^3"
  }
}

// repo root
{
  "devDependencies": {
    "pnpm": "^10",
    "turbo": "^2"
  }
}
```

---

## Appendix — concerns explicitly NOT chosen

- **LangChain JS** — wrong layer of abstraction for Vibe (prompt-orchestration framework; Vibe is a *project* abstraction above that). Reconsider only if Vibe ever grows in-language RAG primitives.
- **Nx** — overkill for two packages; conflicts with letting Langium own scaffolding.
- **Vite for the extension bundle** — Vite's CJS deprecation makes it the wrong tool for VS Code extension hosts. (It is fine for *webview* contents if Vibe ever adds one.)
- **isomorphic-git as primary** — slower than shelling out on real repos; only relevant when in-browser git is needed.
- **micromark as primary markdown** — too low-level for Vibe's transformation needs; remark is the right shape.
- **Valibot / ArkType** — bundle-size and perf wins don't apply server-side; using anything other than Zod adds friction with MCP SDK and Vercel AI SDK.
- **nearley** — volunteer-maintained, infrequent releases, slower than Chevrotain.
- **`obsidian-ts`** — pre-1.0, assumes a running Obsidian app, mismatched with Vibe's "write a folder" model.
- **Custom CLI for Grok in Phase 1** — no official xAI CLI exists yet; defer to API-mode.

---

*End of survey. Confidence: high on §1–5, §7, §8, §10–12; medium on §6 (CLI provider landscape moves fast); low on §9 (very small ecosystem, mostly DIY).*
