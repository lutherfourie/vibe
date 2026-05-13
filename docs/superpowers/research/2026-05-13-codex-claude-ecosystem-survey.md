# Codex × Claude Code × Cerebras: Agentic Ecosystem Survey

*Research input for the design of Vibe (Vibelang), a unified provider-agnostic specification language for administrating vibecoded ecosystems.*

**Date:** 2026-05-13
**Author:** Claude Code (Opus 4.7, 1M context), research session
**Scope:** Codex, Claude Code, broader OpenAI / Anthropic / Cerebras stacks; standardization attempts; IDE/editor agentic surfaces.

---

## 0. Executive summary

In May 2026 the three providers a working "vibecoder" routinely swaps between — Anthropic's [Claude Code](https://code.claude.com/docs/en/), OpenAI's [Codex](https://developers.openai.com/codex), and [Cerebras](https://www.cerebras.ai/inference)-hosted inference — have converged on a *recognizable* but *still incompatible* shape for agentic project administration. Every tool now expects:

1. **A persistent project-memory file** at repo root (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.windsurfrules`, `.continue/rules/`, `.aider.conf.yml`),
2. **Folder-resident first-class definitions** for sub-agents, skills, slash commands, hooks, and tool/MCP bindings,
3. **JSON-Schema-shaped tool calls** as the underlying contract for function/tool invocation, and
4. **A harness** — initializer + worker, planner/generator/evaluator, or brain/hands/session — to bridge limited context windows across multi-hour autonomous runs.

What differs — and what Vibe could profitably unify — is the *encoding*: each provider chose its own filenames, frontmatter, manifest formats, hook event vocabularies, and config layering rules. The standardization layer that already works cross-provider is the **JSON-Schema function-call shape** plus, increasingly, the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/specification/2025-11-25). Everything *above* function calling — sub-agents, skills, memory, plans, slash commands, hooks, and the "harness" that bridges sessions — is fragmented.

Below is a tour of the state-of-play, organized to mirror the 8 questions in the brief.

---

## 1. Project structure & on-disk conventions

### 1.1 Claude Code

A Claude Code project at typical maturity has this layout (compiled from [official docs](https://code.claude.com/docs/en/memory), [alexop.dev](https://alexop.dev/posts/claude-code-customization-guide-claudemd-skills-subagents/), and [the plugin template](https://github.com/ivan-magda/claude-code-plugin-template)):

```
repo/
├── CLAUDE.md                       # project memory (always loaded)
├── CLAUDE.local.md                 # gitignored personal overrides
├── .claude/
│   ├── settings.json               # permissions, hooks, env
│   ├── settings.local.json         # personal overrides
│   ├── agents/<name>.md            # subagents (YAML frontmatter + body)
│   ├── skills/<name>/SKILL.md      # skills (folder + frontmatter)
│   ├── commands/<name>.md          # slash commands (legacy; still works)
│   ├── rules/*.md                  # path-scoped rules
│   └── plugin-name.local.md        # per-plugin local state
├── .claude-plugin/
│   ├── plugin.json                 # plugin manifest
│   └── marketplace.json            # if you ship a marketplace
└── ~/.claude/CLAUDE.md             # user-global memory (outside repo)
```

**Memory hierarchy.** Claude Code walks the directory tree from cwd toward repo root and concatenates every `CLAUDE.md` it finds, then prepends `~/.claude/CLAUDE.md`; lower-in-tree files appear later and effectively override earlier ones. Recursive `@import` references resolve up to **5 levels deep**, and `@file` references in a user prompt also pull in any `CLAUDE.md` in that file's directory chain ([memory docs](https://code.claude.com/docs/en/memory); see [agentfactory.panaversity.org](https://agentfactory.panaversity.org/docs/General-Agents-Foundations/claude-code-teams-cicd/claude-md-configuration-hierarchy)).

### 1.2 Codex

Codex centers on `AGENTS.md` ([guide](https://developers.openai.com/codex/guides/agents-md)). Discovery is a layered chain:

1. **Global**: `~/.codex/AGENTS.override.md` if it exists, otherwise `~/.codex/AGENTS.md`. Only one file at this level.
2. **Project**: starting at the project root, walking *down* to cwd, each directory contributes one of: `AGENTS.override.md`, `AGENTS.md`, or any name in `project_doc_fallback_filenames`.
3. Files are concatenated root → cwd with blank-line separators; **later (closer-to-cwd) files override earlier guidance**.
4. Hard size cap `project_doc_max_bytes` (default **32 KiB**); empty files skipped; cannot search upward past cwd.

Project disk layout:

```
repo/
├── AGENTS.md
├── AGENTS.override.md              # optional temporary replacement
├── .codex/
│   ├── config.toml                 # trusted-project scoped config
│   └── agents/<name>.toml          # custom subagents (TOML, not MD)
└── ~/.codex/
    ├── AGENTS.md
    ├── config.toml                 # personal-scope config, profiles, MCP
    └── agents/<name>.toml          # personal-scope subagents
```

Note the substantive divergence: **Claude Code uses Markdown with YAML frontmatter for subagents/skills/commands; Codex uses TOML files**. ([Codex subagents](https://developers.openai.com/codex/subagents))

### 1.3 The "AGENTS.md cross-tool standard"

[`agents.md`](https://agents.md/) is now stewarded by the **Agentic AI Foundation under the Linux Foundation** and is used by **60,000+ public projects**. Native loaders ship in Codex, Cursor, Copilot, Devin, Windsurf, Gemini CLI, Zed, Warp, Antigravity v1.20.3+ ([adoption summary](https://www.harness.io/blog/the-agent-native-repo-why-agents-md-is-the-new-standard), [Antigravity guide](https://antigravity.codes/blog/antigravity-agents-md-guide)). **Notable holdout: Claude Code, which as of April 2026 still requires `CLAUDE.md`** — the open issue [anthropics/claude-code#6235](https://github.com/anthropics/claude-code) has thousands of upvotes but no native support shipped ([hivetrail comparison](https://hivetrail.com/blog/agents-md-vs-claude-md-cross-tool-standard)). In practice users symlink `AGENTS.md ↔ CLAUDE.md` or duplicate content.

### 1.4 IDE / coding assistant rules files

| Tool | File | Format | Hierarchical? |
|---|---|---|---|
| Cursor | `.cursorrules` / `.cursor/rules/*.mdc` | Markdown | Yes |
| Windsurf | `.windsurfrules` | Markdown | Project root only |
| Continue.dev | `.continue/rules/*.md` or YAML in `config.yaml` | MD or YAML | Workspace |
| Aider | `.aider.conf.yml` | YAML | Project + global |
| Codex | `AGENTS.md` | Markdown | Walks tree down |
| Claude Code | `CLAUDE.md` + `.claude/rules/*.md` | Markdown + frontmatter | Walks tree up |

Sources: [Continue rules](https://docs.continue.dev/customize/deep-dives/rules), [Cursor vs Windsurf 2026](https://www.verdent.ai/guides/windsurf-vs-cursor-2026), [Aider repomap](https://aider.chat/docs/repomap.html), [cursor-alternatives.com](https://cursor-alternatives.com/blog/continue-dev-rules/).

---

## 2. Agent / plugin / skill / subagent contracts

### 2.1 Claude Code subagents — Markdown + YAML frontmatter

Defined in `.claude/agents/<name>.md` (project) or `~/.claude/agents/<name>.md` (user). Each file is YAML frontmatter followed by a Markdown system prompt. The full frontmatter surface ([sub-agents docs](https://code.claude.com/docs/en/sub-agents)):

```yaml
---
name: code-reviewer
description: Reviews diffs for security, style, and tests. Use after edits.
prompt: |
  You are a strict code reviewer...
tools: [Read, Grep, Bash]
disallowedTools: [Write, Edit]
model: haiku            # or claude-opus-4-7, etc.
permissionMode: plan    # plan | acceptEdits | bypassPermissions
mcpServers: [github, postgres]
hooks: { PreToolUse: ./hooks/lint.sh }
maxTurns: 12
skills: [security-review]
initialPrompt: "Begin by listing changed files"
memory: false
effort: high            # standard | high | xhigh | max
background: false
isolation: full
color: orange
---
```

Subagents run in their own context window; the parent agent sees only their *summary return value*. Plugin-installed subagents **cannot** carry `hooks`, `mcpServers`, or `permissionMode` for security reasons ([alexop.dev plugin walkthrough](https://alexop.dev/posts/understanding-claude-code-full-stack/)).

### 2.2 Claude Code skills — folder + SKILL.md

Skills (`.claude/skills/<slug>/SKILL.md`) implement **progressive disclosure** ([skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview), [skill best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)):

- Frontmatter is scanned at session start (~100 tokens/skill).
- The full body (~5 KB target) is loaded **only when the description matches the user's intent**.
- Skills may ship helper scripts/resources alongside SKILL.md.
- This reportedly cuts average context use **60–80%** versus monolithic system prompts ([buildfastwithai.com](https://www.buildfastwithai.com/blogs/claude-skills-complete-guide-2026)).

In 2026 the previously distinct `.claude/commands/` slash commands and skills have been **unified**: every skill gets a slash-command alias for free ([ofox.ai guide](https://ofox.ai/blog/claude-code-hooks-subagents-skills-complete-guide-2026/)).

### 2.3 Claude Code hooks — event-driven shell scripts

Hooks live in `.claude/settings.json` or `hooks/hooks.json` inside a plugin. Events include `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreCompact`, `Notification`. Unlike prompt-based "policies", hooks are deterministic — they can hard-block a tool call before it runs ([penligent.ai architecture writeup](https://www.penligent.ai/hackinglabs/inside-claude-code-the-architecture-behind-tools-memory-hooks-and-mcp/)).

### 2.4 Claude Code plugins — `plugin.json`

```
my-plugin/
├── .claude-plugin/plugin.json    # manifest: name, version, components
├── commands/   agents/   hooks/   skills/   .mcp.json
```

`marketplace.json` ([Anthropic example](https://github.com/anthropics/claude-plugins-official/blob/main/.claude-plugin/marketplace.json)) lists plugins for distribution.

### 2.5 Codex subagents — TOML files

`.codex/agents/<name>.toml` (project) or `~/.codex/agents/<name>.toml` (personal). Required fields ([Codex subagents](https://developers.openai.com/codex/subagents)):

```toml
name = "doc-writer"
description = "Drafts public API documentation for changed modules"
developer_instructions = """
You document things terse and accurate...
"""
nickname_candidates = ["scribe", "docbot"]
model = "gpt-5.4"
model_reasoning_effort = "high"   # low | medium | high
sandbox_mode = "workspace-write"  # read-only | workspace-write
[mcp_servers.github]
command = "npx"
args    = ["@modelcontextprotocol/server-github"]
skills.config = ["./skills/api_docs"]
```

Spawning is **explicit only** (user must request it); orchestration controls live in `config.toml` under `[agents]`: `max_threads = 6`, `max_depth = 1`, `job_max_runtime_seconds = 1800`. Subagents inherit sandbox policy and runtime overrides from the parent unless they override per-agent.

### 2.6 Codex `config.toml` — profiles, MCP, approvals

From [config-basic](https://developers.openai.com/codex/config-basic) and [config-reference](https://developers.openai.com/codex/config-reference):

```toml
profile = "deep-review"   # default profile

[profiles.deep-review]
model = "gpt-5.5"
approval_policy = "on-request"   # untrusted | on-request | never | granular
model_catalog_json = "./models.json"

[mcp_servers.linear]
command = "linear-mcp"
args = ["--api-key", "${LINEAR_KEY}"]
```

Enterprise mode adds a `requirements.toml` allowlist of approved MCP server identities — Codex refuses to enable anything not on the list ([config-advanced](https://developers.openai.com/codex/config-advanced), [enterprise managed config](https://developers.openai.com/codex/enterprise/managed-configuration)).

### 2.7 Codex Agents SDK

Distinct from Codex CLI: the [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) (Python and [TS](https://github.com/openai/openai-agents-js)) gives you `Agent`, `tool`, `Session`, `handoff`, `Runner`, `Tracing`, `Guardrails`. Handoffs are *modeled as tool calls* (`transfer_to_<agent_name>`), and nested handoffs collapse prior transcripts into `<CONVERSATION HISTORY>` summary blocks. Tracing is opt-out, attaches to the Traces dashboard, and integrates with Langfuse/OpenTelemetry ([tracing docs](https://openai.github.io/openai-agents-python/tracing/)).

---

## 3. Tool / function calling conventions

### 3.1 OpenAI function calling

The current shape ([OpenAI function calling guide](https://developers.openai.com/api/docs/guides/function-calling), [structured outputs intro](https://openai.com/index/introducing-structured-outputs-in-the-api/)):

- Tools are JSON-Schema objects with `name`, `description`, `parameters`, and `strict: true` enables [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
- In the **Chat Completions** API, functions are non-strict by default; in the **Responses API**, they are strict by default ([migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses)).
- **Critical limitation:** `strict: true` is incompatible with `parallel_tool_calls: true`. You must pick one.
- Strict mode requires `additionalProperties: false` on every schema object.

### 3.2 Anthropic tool use

The Anthropic shape ([tool use overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)) returns `stop_reason: "tool_use"` and one or more `tool_use` blocks; the client executes and replies with `tool_result` blocks. Parallel tool use is the **default**; `disable_parallel_tool_use: true` exists but is unavailable with [programmatic tool calling](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling).

Anthropic's [Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use) (Nov 2025 beta, header `advanced-tool-use-2025-11-20`) adds three primitives that diverge significantly from OpenAI:

1. **Tool Search Tool** (`tool_search_tool_regex_20251119`): tools tagged `defer_loading: true` are *not* sent in the initial system prompt — Claude searches a registry and pulls only the tools it needs. Their data shows 55 K → 8 K token savings at session start and Opus 4.5 accuracy from **79.5% → 88.1%**.
2. **Programmatic Tool Calling**: Claude writes Python inside a sandbox that orchestrates many tool calls, processes intermediate results *outside* the model's context window, and returns only a summary. This is the inverse of OpenAI's "many round-trips."
3. **Tool Use Examples** via `input_examples`: concrete demonstrations rather than schemas. Reported accuracy on complex params: **72% → 90%**.

### 3.3 MCP (the cross-provider primitive)

The [MCP spec 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25) defines a JSON-RPC 2.0 protocol with three server-side primitives (**Tools**, **Resources**, **Prompts**) and three client-side primitives (**Sampling**, **Roots**, **Elicitation**). Transports: **stdio**, **Streamable HTTP** (which replaced legacy SSE in Nov 2025; see [2026 roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)). Capability negotiation happens on connect; tool/resource/prompt lists may be dynamic.

**This is the only meaningful cross-provider tool-binding standard today.** Claude Code, Codex, Cursor, Windsurf, Continue, Aider, OpenAI Agents SDK, Claude Agent SDK, and ChatGPT Desktop all consume MCP servers — usually with `.mcp.json` or an `mcp_servers.<name>` config block. Vibe almost certainly compiles tool definitions *down* to MCP.

### 3.4 The portability gap

|  | OpenAI | Anthropic | MCP |
|---|---|---|---|
| JSON Schema params | yes (strict mode) | yes | yes |
| Parallel calls | yes (but not with strict) | yes (default) | depends on host |
| Streaming tool deltas | yes (Responses) | yes (tool_use partial blocks) | yes (Streamable HTTP) |
| Deferred / search-loaded tools | no | yes (advanced beta) | partial (dynamic list) |
| Programmatic orchestration inside the model | no | yes | n/a |
| Caller identity / `allowed_callers` | no | yes | n/a |
| Examples-in-schema | no formal slot | yes (`input_examples`) | server-defined |

JSON Schema parameters are the lingua franca; *everything around them* diverges. Vibe should treat JSON Schema as the universal data interchange and add provider-specific *capability hints* that compile away when targeting a less-capable provider.

---

## 4. Memory & context management

### 4.1 Anthropic's harness research (the load-bearing source)

Anthropic published a three-part canon on agent harness design in 2026 that is the single most important reference for Vibe.

**[Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)** — the foundational piece. Patterns:

- **Two-agent split**: an **Initializer Agent** runs once to set up scaffolding; a **Coding Agent** does incremental work across many sessions.
- **Progress artifact**: `claude-progress.txt` — a chronological log of decisions, paired with git history.
- **Feature ledger**: `feature_list.json` — `{description, steps, passes: bool}` per feature; agents are only allowed to flip `passes`.
- **Bootstrap script**: `init.sh` — captures "how to run the app" so agents don't relearn each session.
- Three-step session start: read git log → read progress file → run baseline tests *before* writing code.

**[Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps)** — extends to a **planner / generator / evaluator** triple. The evaluator drives Playwright MCP through the running app. Insight: **prefer context resets over compaction** — start a fresh agent with structured handoff rather than summarize in place. "Every component in a harness encodes an assumption about what the model can't do on its own" (i.e., harnesses *shrink* as models get better).

**[Scaling Managed Agents: Decoupling the brain from the hands](https://www.anthropic.com/engineering/managed-agents)** — production architecture for hosted long-running agents:

- **Brain** = Claude + harness (reasoning)
- **Hands** = ephemeral sandboxes (execution)
- **Session** = durable append-only event log (memory)
- API shape: `execute(name, input) → string`, `wake(sessionId)`, `getSession(id)`, `getEvents()`.
- Result: p95 TTFT improved >90% by lazily provisioning containers only when a tool call needs one.

### 4.2 OpenAI's long-horizon approach

[GPT-5.2-Codex](https://openai.com/index/introducing-gpt-5-2-codex/) introduced **automatic context compaction** for long-horizon work. [GPT-5.5](https://openai.com/index/introducing-gpt-5-5/) (April 2026) is benchmarked against an internal "Expert-SWE" eval with a 20-hour median human completion time and outperforms 5.4. [GPT-5.3-Codex](https://openai.com/index/introducing-gpt-5-3-codex/) added subagents specifically for codebase exploration. [GPT-5.1-Codex-Max](https://openai.com/index/gpt-5-1-codex-max/) targets very large context windows for big-repo refactors.

OpenAI's lever is *primarily model-side* — better long-horizon eval scores, better in-model compaction — whereas Anthropic's is *primarily harness-side* — published architectures the user composes. Codex's CLI does still write planning files (`.codex/state/` and ad-hoc plan markdowns) and surfaces a `/approvals` command for human-in-the-loop ([best practices](https://developers.openai.com/codex/learn/best-practices)).

### 4.3 Claude Code's memory APIs

Claude Code provides three context primitives:

1. **Files**: `CLAUDE.md` hierarchy + `@import` (5-level recursion). Quasi-static.
2. **Memory tool** (private memory): persistent notes Claude writes to its workspace.
3. **Subagent isolation**: parent's window is preserved; only return values bubble up.

The [`agent-view`](https://code.claude.com/docs/en/agent-view) and `agent-teams` modes add long-running cross-session orchestration.

### 4.4 Cross-tool memory friction

Nothing is portable. A user switching from Codex to Claude Code today must duplicate `AGENTS.md` → `CLAUDE.md`, re-author subagents (TOML → MD-with-frontmatter), re-author skills/commands, and re-bind MCP servers in two different config files. **This is the single biggest pain point Vibe could attack.**

---

## 5. Provider-specific primitives worth modeling

### 5.1 Anthropic uniques

- **[Artifacts](https://suprmind.ai/hub/claude/features/)** — Claude.ai surface for side-channel structured outputs (code, docs, HTML) that the user manipulates without polluting chat history.
- **[Computer Use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)** — screenshot + mouse/keyboard primitives; GA on claude.ai March 2026.
- **[Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)** — explicit cache breakpoints. As of Feb 5 2026 caches are **workspace-isolated**, not org-isolated. Thinking blocks cache too. ([mager.co writeup](https://www.mager.co/blog/2026-04-29-claude-prompt-caching/))
- **[Extended / Adaptive Thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)** — fixed thinking budgets in 3.7, replaced by *adaptive reasoning* in 4.6 (Feb 2026) with effort levels `standard | high | xhigh | max`.
- **Advanced tool use beta** (see §3.2).
- **Memory tool** (filesystem-style persistent memory for the agent).

### 5.2 OpenAI / Codex uniques

- **Profiles** in `config.toml` (multi-context model/approval bundles per project).
- **Approval policies**: `untrusted | on-request | never | granular`, plus enterprise `requirements.toml` allowlists.
- **AGENTS.override.md** — non-destructive override at any scope.
- **Agents SDK** with first-class `handoff`, `Guardrails`, built-in `Tracing`.
- **GPT-5.x-Codex** family with model-side compaction.
- **Codex CLI's strict sandbox-mode flags** per subagent.
- **Cerebras partnership**: GPT-5.3-Codex-Spark on Cerebras WSE-3 — **~1,000+ tokens/sec, ~15× standard path** ([changelog](https://developers.openai.com/codex/changelog)).

### 5.3 Cerebras (the speed lever, not a frontier-model maker)

Cerebras runs other people's open weights extremely fast on wafer-scale hardware. Hosted as of April 2026 ([supported models](https://inference-docs.cerebras.ai/models/overview), [TokenMix benchmarks](https://tokenmix.ai/blog/cerebras-api-key-access-speed-tests-2026), [Artificial Analysis](https://artificialanalysis.ai/providers/cerebras)):

- **Models**: GPT-OSS-120B, Llama 3.1-8B, Llama 3.3-70B, Qwen 3-32B, Qwen 3-235B Instruct, Qwen 3-235B Thinking, ZAI GLM-4.7.
- **Throughput**: Llama 3.1-8B at **~2,326 tok/s**, gpt-oss-120B at **~1,857 tok/s (high)**, Llama 3.3-70B at **~1,800 tok/s** — roughly 10–20× typical GPU inference.
- **Time-to-first-token**: GLM-4.7 at **~0.40 s**, gpt-oss-120B at **~0.49 s**.
- **API shape**: OpenAI-compatible. You point any OpenAI-style client (or LiteLLM) at `https://api.cerebras.ai/v1` with a `CEREBRAS_API_KEY`.
- **Integrations**: Cerebras ships a [Cerebras Code MCP Server](https://inference-docs.cerebras.ai/integrations/code-mcp) that plugs into Cursor and Claude Code; users also route Codex/Claude Code traffic through [Bifrost](https://www.getmaxim.ai/articles/how-to-use-bifrost-cli-with-coding-agents-like-claude-code/) or [LiteLLM](https://docs.litellm.ai/) to hit Cerebras.

**Implication**: Cerebras is the "fast-tier" provider — ideal for tight inner loops, repo map / grep / lint subagents — but is OpenAI-API-shaped, so abstracting over it is the same problem as abstracting over OpenAI.

---

## 6. Inter-provider portability today

### 6.1 What works across all of them

- **JSON-Schema-typed tool calls** are universal.
- **MCP server bindings** are widely consumed by every major host (Claude Code, Codex CLI, Cursor, Windsurf, Continue, Aider, OpenAI Agents SDK, Claude Agent SDK).
- **OpenAI-shaped REST endpoints** are the lowest common denominator — LiteLLM, OpenRouter, vLLM, Together, Groq, Cerebras, Anthropic-Bedrock-translate, and most local servers all speak this shape.
- **Markdown-with-frontmatter** is the dominant "definition" file format for sub-agents / skills (Codex notwithstanding) and `.md` rules files.

### 6.2 What doesn't port

- **Subagent definitions** — Codex TOML vs Claude MD/YAML.
- **Slash commands and skills** — Claude has them; Codex doesn't have skills as a first-class concept (yet).
- **Hooks vocabularies** — Claude Code's `PreToolUse`/`Stop`/`PreCompact`/etc.; Windsurf's *Cascade Hooks*; Codex has approval policies, not hooks.
- **Plan / progress files** — `claude-progress.txt`, Codex's `.codex/state/`, Aider's git commits, Continue's chat history. No shared schema.
- **Tool-call advanced features** — strict mode (OpenAI), tool search & programmatic calling (Anthropic), `defer_loading`, `input_examples`, `allowed_callers`.
- **Prompt caching keys** — Anthropic has explicit breakpoints; OpenAI has implicit prefix caching with different semantics.
- **Memory file precedence** — Claude walks *up*, Codex walks *down*, Cursor and Windsurf are root-only.

### 6.3 Friction the user actually feels

The patterns observed in community writeups ([anubhav medium six-month tuning](https://medium.com/data-science-collective/i-spent-6-months-tuning-claude-code-heres-the-exact-setup-that-finally-worked-b41c67628478), [openaitoolshub workflow examples](https://www.openaitoolshub.org/en/blog/claude-code-workflow-examples), [llmx.tech Codex setup](https://llmx.tech/blog/openai-codex-setup-agents-md-mcps-skills-definitive-guide/)):

1. Symlinking `AGENTS.md ↔ CLAUDE.md` so both Codex and Claude Code see the same memory.
2. Re-authoring every subagent for the other tool.
3. Duplicating MCP-server config in two formats (`config.toml` `[mcp_servers.x]` vs `.mcp.json`).
4. Plan/progress files in one tool are invisible to the other.
5. Approval/permission concepts are entirely different — Codex's `approval_policy` versus Claude's `permissionMode` + hooks.

---

## 7. Existing standardization attempts

### 7.1 LangChain & LangGraph

[LangChain](https://www.langchain.com/) is **the** orchestration meta-framework with ~100K stars and 34.5M monthly downloads ([Morph LLM frameworks 2026](https://www.morphllm.com/llm-frameworks)). It standardizes a *Python/TS abstraction* over chains, tools, retrievers, and memory. **Common critique**: leaky abstractions, breaking minor-version changes, debugging pain ("digging through multiple wrapper classes"), and overhead (~10 ms framework cost per call vs ~3.5 ms for DSPy). LangGraph addresses orchestration-as-state-machine but adds further runtime cost.

**What LangChain doesn't try to standardize**: the on-disk *project shape* a vibecoder works with. It's a runtime SDK, not a spec language.

### 7.2 LlamaIndex

[LlamaIndex](https://www.llamaindex.ai/) is the RAG-first cousin — indices, retrievers, query engines. Same SDK-not-spec critique applies. Where LangChain owns "orchestration", LlamaIndex owns "documents/data → LLM" plumbing ([Kanerika comparison](https://kanerika.com/blogs/langchain-vs-llamaindex/)).

### 7.3 DSPy

[DSPy](https://dspy.ai/) is the most philosophically aligned with Vibe's brief. It treats prompts as **declarative typed signatures** (e.g., `question -> answer`) and *compiles* them with optimizers (MIPRO, BootstrapFewShot, etc.) into actual prompts and few-shot exemplars. It standardizes the **module + signature** abstraction and adds compilation/optimization as a first-class step ([signatures](https://dspy.ai/learn/programming/signatures/), [arXiv 2310.03714](https://arxiv.org/abs/2310.03714)). 28K+ stars, 160K+ monthly downloads.

**Strength**: it's a *language* for prompting, not a wrapper SDK; optimization is built in. **Weakness for Vibe**: scope is the individual LLM call / pipeline, not the broader project ecosystem (no subagents, hooks, memory hierarchy, MCP bindings).

### 7.4 BAML

[BAML (BoundaryML)](https://boundaryml.com/) is a **domain-specific language** that compiles `.baml` source into typed clients for Python / TS / Ruby / Go / Java / C# / Rust ([GitHub](https://github.com/BoundaryML/baml)). Its **Schema-Aligned Parsing (SAP)** algorithm is a real innovation: tolerant parsing of LLM outputs (markdown-in-JSON, chain-of-thought before answer, broken JSON). Supports OpenAI, Anthropic, Gemini, Bedrock, Azure, Vertex, and OpenAI-compatible servers.

**Strength**: shares Vibe's "declarative source, multi-language outputs" instinct; provider-agnostic. **Weakness for Vibe**: scoped to **prompts as typed functions** — not subagents, harnesses, hooks, MCP, project memory.

### 7.5 LiteLLM & OpenRouter

[LiteLLM](https://docs.litellm.ai/) is the **OpenAI-shaped proxy / Python SDK** for 100+ providers. ~40K stars, 1,300+ contributors as of March 2026 ([a2a-mcp.org guide](https://a2a-mcp.org/blog/what-is-litellm)). [OpenRouter](https://openrouter.ai/) is the **hosted gateway** doing the same.

**Strength**: solid for the *call layer* — model routing, fallback, cost tracking, caching, virtual API keys. **Weakness for Vibe**: pure inference plumbing; tells you nothing about subagents, projects, skills, memory.

### 7.6 MCP itself

The **only** standardization layer that has crossed all major hosts. But MCP standardizes **tools / resources / prompts**, not **agents** or **projects**. There is no MCP equivalent of "this is a subagent definition" or "this is a project memory file."

### 7.7 What gap remains for Vibe?

Composite map of who covers what:

```
                Project shape   Subagent   Skill   Hook   Memory   Tool     Prompt    Call layer
                / AGENTS.md     contract           events  files    binding  compile   / fallback
LangChain            -            ~       -        -      ~        yes      no        no
LlamaIndex           -            ~       -        -      ~        yes      no        no
DSPy                 -            -       -        -      ~        ~        YES       no
BAML                 -            -       -        -      -        ~        YES       no
LiteLLM              -            -       -        -      -        no       no        YES
OpenRouter           -            -       -        -      -        no       no        YES
MCP                  -            -       -        -      -        YES      ~         no
AGENTS.md            ~            no      no       no     no       no       no        no
Claude Code / Codex  YES          YES     mixed    Cl.    YES      YES      no        no
```

**The gap is the *project shape × subagent × skill × hook × memory* surface, abstracted across providers, with MCP & JSON-Schema as the lowering target.** No existing tool covers this row at the *spec-language* level. That is precisely the Vibe-shaped hole.

---

## 8. IDE / editor experience for agentic coding

### 8.1 Cursor

`.cursorrules` (legacy) / `.cursor/rules/*.mdc` files; Agent mode for multi-step plans; native MCP support; recent **AGENTS.md** support. Reported 70% fewer PR review comments and 35% fewer TS errors when rules are well-tuned ([Codecademy agentic IDE comparison](https://www.codecademy.com/article/agentic-ide-comparison-cursor-vs-windsurf-vs-antigravity)).

### 8.2 Windsurf

`.windsurfrules` (root only — no hierarchical inheritance). Wave 13 (early 2026) added **parallel agent sessions** and **Cascade Hooks** for enforcing coding standards. Cascade can plan multi-step changes, execute terminal commands, read linter output, edit across the project. **No `.cursorrules` equivalent migrates** cleanly — has to be re-embedded ([Verdent comparison](https://www.verdent.ai/guides/windsurf-vs-cursor-2026)).

### 8.3 Continue.dev

`.continue/rules/*.md` (or YAML strings in `config.yaml`). Markdown rules supersede the older `slashCommands` / `customCommands` arrays; custom prompts now use the `prompts:` field. Open-source, model-agnostic, MCP-aware ([rules docs](https://docs.continue.dev/customize/deep-dives/rules)).

### 8.4 Aider

Terminal-only pair programmer with a **repo map** — the killer feature: a concise tag-soup of the most important classes/functions/signatures across the whole git repo, capped by `--map-tokens` (default 1K, 0 disables). Lets *any* model — Claude Sonnet, DeepSeek, o3-mini, GPT-4o, local models — get whole-repo context at low token cost. Config in `.aider.conf.yml` ([repomap docs](https://aider.chat/docs/repomap.html)).

### 8.5 Claude Code (CLI/extension)

Native terminal harness + VS Code/JetBrains extension. Sub-agents, skills, hooks, plugins, MCP all first-class. The extension surfaces the same primitives the CLI does. The `/agents` slash command bootstraps subagent files.

### 8.6 OpenAI Codex (CLI + IDE extension + ChatGPT app)

CLI, VS Code extension, and ChatGPT app share the same `config.toml`. `/approvals` toggles approval policy mid-session; `/agent` switches between subagent threads. Subagent approvals from inactive threads surface as notifications; press `o` to open before approving.

### 8.7 What's good for *spec/plan* writing (not code completion)

The IDEs that best support spec/plan-driven workflows in 2026:

- **Claude Code** with the `superpowers:writing-plans` / `executing-plans` skill pattern and `claude-progress.txt` ([Anthropic harness post](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)).
- **Cursor** with `/spec`-style custom rules and Agent mode multi-step planning.
- **Codex CLI** with `AGENTS.md` + planner subagents + `gpt-5.5` long-horizon evals.
- **Aider** for spec-then-implement with atomic git commits per change.

The shared insight, captured in [*From Vibe Coding to Spec-Driven Development*](https://towardsdatascience.com/from-vibe-coding-to-spec-driven-development/) and [Karpathy's 2026 turn](https://emergent.sh/learn/what-is-vibe-coding): **prompt engineering is becoming specification engineering**. Front-loading scope/constraints/architecture/acceptance criteria as durable files. Vibe is squarely in that arc.

---

## 9. Implications for Vibe's design

The following are opinionated, evidence-backed recommendations the rest of the report supports.

### R1. Compile target, not runtime — Vibe should be a *spec language*, not another SDK

LangChain, LlamaIndex, LiteLLM, OpenAI Agents SDK, Claude Agent SDK all live at the *runtime* layer. The gap is the *spec* layer. Vibe should look more like **BAML or DSPy** in distribution — a source language with multi-target codegen — and less like LangChain. Specifically, a `.vibe` source should compile *down to*:

- `CLAUDE.md` + `.claude/agents/*.md` + `.claude/skills/*/SKILL.md` + `.claude/settings.json` for Claude Code, and
- `AGENTS.md` + `.codex/config.toml` + `.codex/agents/*.toml` for Codex,
- `.mcp.json` and `mcp_servers.<name>` blocks for MCP host configuration,
- `.cursorrules` / `.windsurfrules` / `.continue/rules/*` for the IDEs,
- OpenAI-compatible client configs for Cerebras/OpenRouter/LiteLLM.

This makes Vibe the **single source of truth** the user edits, and provider-specific files become **build artifacts**.

### R2. Embrace MCP + JSON Schema as the universal data interchange

Already the only thing crossing every host. Vibe's **tool** primitive should compile 1:1 to MCP tool definitions, and its **resource** primitive should compile 1:1 to MCP resources. Vibe owns the surface; MCP is the wire format. Add Anthropic-specific *capability hints* (`defer_loading`, `input_examples`, `allowed_callers`) that gracefully degrade when targeting OpenAI/Cerebras.

### R3. First-class subagent contract that abstracts over MD/YAML and TOML

A single Vibe declaration like:

```
agent code-reviewer {
  description = "Reviews diffs for security, style, tests."
  model       = anthropic.haiku | openai.gpt-5.5 | cerebras.gpt-oss-120b
  tools       = [Read, Grep, Bash]
  permissions = plan
  isolation   = full
  effort      = high
}
```

…should produce **both** `.claude/agents/code-reviewer.md` (YAML frontmatter + body) **and** `.codex/agents/code-reviewer.toml`. Field-mapping table is small enough to be a static codegen.

### R4. Codify the Anthropic harness primitives as the long-horizon ground truth

`claude-progress.txt`, `feature_list.json`, `init.sh`, planner/generator/evaluator triple, brain/hands/session split — these are the most rigorously validated patterns in the industry for multi-hour agentic work. Vibe should ship them as **named harness templates** (e.g., `harness = "planner-generator-evaluator"`) that emit the right scaffold files. Don't force users to reinvent them. Cite the source so they understand the lineage.

### R5. Hierarchical memory model with explicit "walk direction"

Claude walks *up* the tree; Codex walks *down*; Cursor is *root-only*. A Vibe project file should declare its memory model once (`memory.walk = "down"`, `memory.max_bytes = 32768`, `memory.precedence = "later-wins"`) and have the compiler emit correct semantics per target. Imports/`@file` references should resolve at compile time so the rendered `CLAUDE.md` and `AGENTS.md` are flat.

### R6. Treat skills/commands as one thing (Claude Code already did)

Claude Code's 2026 unification of skills and slash commands is the right design. Vibe's `skill` primitive should always carry a slash-command alias, frontmatter for progressive disclosure, and an optional helper-scripts dir. When targeting Codex (which has no skill primitive), skills compile to *callable subagents* with the same description-based dispatch.

### R7. Hook events as a controlled vocabulary, not a free-form callback grab bag

Standardize the event names (`PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreCompact`, `Notification`) — this is essentially Claude Code's vocabulary and it's already the richest. When targeting Codex (no hooks), Vibe should *gracefully degrade* hooks to either `approval_policy = "on-request"` rules or to MCP servers that wrap the work. When targeting Windsurf, map to Cascade Hooks.

### R8. Provider routing as a config concern, not a code concern

A Vibe project should declare *which model goes where* declaratively:

```
route planner    -> anthropic.opus-4-7
route generator  -> openai.gpt-5.5-codex
route evaluator  -> openai.gpt-5.5
route grep       -> cerebras.gpt-oss-120b   # speed-critical
fallback         -> openrouter
```

Compile this to LiteLLM router config / OpenAI Agents SDK runners / Claude Code subagent `model:` fields. **Speed-tier vs reasoning-tier routing is now a real workflow concern** — Cerebras's 15× speedup on Codex-Spark and 2,000+ tok/s on Llama 3.1 makes it genuinely cost-effective to keep slow models out of the inner loop.

### R9. Make `AGENTS.md` the canonical *human-readable* projection

Adoption matters: 60K+ projects already have an `AGENTS.md`. Vibe should treat `AGENTS.md` (with optional supplemental sections) as **the primary text artifact a human reads in a code review** and `.claude-plugin/plugin.json`, `.codex/agents/*.toml`, etc., as machine outputs. This gives Vibe immediate compatibility with the GitHub-rendered, agentless reader experience.

### R10. Build for the post-vibe-coding "spec engineering" turn

The Karpathy reversal and the [arXiv 2510.12399 vibe-coding survey](https://arxiv.org/abs/2510.12399) point the same direction: **freeform vibe-coding peaked in 2025; 2026's discipline is specification engineering**. Vibe should therefore be opinionated about:

- **Acceptance criteria** as a first-class block (compiles to evaluator subagent prompts).
- **Plan files** as first-class artifacts (compiles to `claude-progress.txt` + `feature_list.json`).
- **Spec → tests** generation as a built-in skill (Playwright MCP + pytest harness templates).
- **Diff-as-output**: Vibe should encourage agents to emit unified diffs / structured patches, not freeform code, so review and rollback are tractable.

---

## 10. Selected sources (canonical reading list for Vibe designers)

**Anthropic harness canon** (highest priority):
- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- [Scaling Managed Agents: Decoupling the brain from the hands](https://www.anthropic.com/engineering/managed-agents)
- [Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use)

**Claude Code reference**:
- [Sub-agents](https://code.claude.com/docs/en/sub-agents) · [Skills](https://code.claude.com/docs/en/skills) · [Memory](https://code.claude.com/docs/en/memory) · [Plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces) · [Agent skills API docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)

**Codex reference**:
- [AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md) · [Subagents](https://developers.openai.com/codex/subagents) · [Config basics](https://developers.openai.com/codex/config-basic) / [reference](https://developers.openai.com/codex/config-reference) / [advanced](https://developers.openai.com/codex/config-advanced) · [MCP](https://developers.openai.com/codex/mcp) · [Best practices](https://developers.openai.com/codex/learn/best-practices) · [Changelog](https://developers.openai.com/codex/changelog)

**OpenAI Models for long-horizon coding**:
- [GPT-5.5](https://openai.com/index/introducing-gpt-5-5/) · [GPT-5.4](https://openai.com/index/introducing-gpt-5-4/) · [GPT-5.3-Codex](https://openai.com/index/introducing-gpt-5-3-codex/) · [GPT-5.2-Codex](https://openai.com/index/introducing-gpt-5-2-codex/) · [GPT-5.1-Codex-Max](https://openai.com/index/gpt-5-1-codex-max/)

**Standards**:
- [agents.md](https://agents.md/) · [Model Context Protocol spec 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25) · [MCP 2026 roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/) · [Function calling](https://developers.openai.com/api/docs/guides/function-calling) · [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) · [Anthropic tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)

**Frameworks compared**:
- [DSPy](https://dspy.ai/) ([signatures](https://dspy.ai/learn/programming/signatures/), [paper](https://arxiv.org/abs/2310.03714)) · [BAML](https://boundaryml.com/) ([GitHub](https://github.com/BoundaryML/baml)) · [LangChain](https://www.langchain.com/) · [LlamaIndex](https://www.llamaindex.ai/) · [LiteLLM](https://docs.litellm.ai/) · [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) · [Morph LLM Frameworks 2026](https://www.morphllm.com/llm-frameworks)

**Cerebras**:
- [Cerebras Inference](https://www.cerebras.ai/inference) · [Supported models](https://inference-docs.cerebras.ai/models/overview) · [Code MCP Server](https://inference-docs.cerebras.ai/integrations/code-mcp) · [Artificial Analysis benchmarks](https://artificialanalysis.ai/providers/cerebras) · [TokenMix speed tests](https://tokenmix.ai/blog/cerebras-api-key-access-speed-tests-2026)

**IDEs**:
- [Cursor vs Windsurf vs Antigravity (Codecademy 2026)](https://www.codecademy.com/article/agentic-ide-comparison-cursor-vs-windsurf-vs-antigravity) · [Verdent Windsurf vs Cursor](https://www.verdent.ai/guides/windsurf-vs-cursor-2026) · [Continue rules](https://docs.continue.dev/customize/deep-dives/rules) · [Aider repomap](https://aider.chat/docs/repomap.html)

**Vibe-coding meta**:
- [arXiv 2510.12399 Survey of Vibe Coding](https://arxiv.org/abs/2510.12399) · [From Vibe Coding to Spec-Driven Development](https://towardsdatascience.com/from-vibe-coding-to-spec-driven-development/) · [Wikipedia: Vibe coding](https://en.wikipedia.org/wiki/Vibe_coding)
