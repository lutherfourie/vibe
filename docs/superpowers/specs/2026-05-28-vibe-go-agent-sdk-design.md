# Vibe Go Agent SDK — design (SP1)

**Date:** 2026-05-28
**Status:** APPROVED (proceeding to implementation, piece by piece via codex)
**Repo:** `C:\vibe` (module `github.com/lutherfourie/vibe/go`, Go 1.22)
**Companion:** Cockpit workflow doc `C:\Users\4elut\Documents\Cockpit\docs\superpowers\specs\2026-05-28-cockpit-vibe-hermes-workflow-design.md`

## Goal & north star
Build a **Go agent runtime SDK** that becomes the execution core for Cockpit. The end state: Cockpit (UI) + this SDK (engine) **replace the Claude Windows desktop app** — open, scriptable, wired into the user's machine. The `.vibe` language is a later optimization layer that compiles to and runs *through* this SDK; the SDK is primary.

## Guiding principle (from the user)
**Provider-agnostic core; vendor-specifics as adapters/workarounds.** Build on the surface every modern LLM/agent CLI shares (run a turn → stream text/tool events; tools via MCP, the one real cross-vendor standard). Anything Claude-specific (CLI quirks, permission flags) lives *inside* the claude adapter and can be dropped as the ecosystem standardizes. This is Cockpit's "model-independent kernel" philosophy pushed into the SDK.

## Architecture
```
Cockpit (Next.js PWA)  ──HTTP+SSE──►  vibe serve  (Go daemon = the SDK runtime)
                                        ├─ Agent loop            (agnostic core)
                                        ├─ MCP host              (your servers → standardized tools)
                                        └─ Provider adapters:
                                             • claude  (drives the `claude` CLI)   ← first
                                             • codex   (codex CLI)
                                             • cerebras / openai (API)
```

### Agnostic core (package `github.com/lutherfourie/vibe/go/agent`)
- **Types:** `Role` (system/user/assistant/tool), `Message{Role, Content}`, `ToolCall{ID, Name, Args}`, `ToolResult{ID, Content, IsError}`, `Usage{InputTokens, OutputTokens, CostUSD}`.
- **Event** (streamed): a tagged union with `Kind` in {`text_delta`, `tool_call`, `tool_result`, `usage`, `error`, `done`} plus the relevant payload. One event type the UI renders uniformly regardless of provider.
- **Provider interface:**
  ```go
  type Provider interface {
      Name() string
      RunTurn(ctx context.Context, req TurnRequest) (<-chan Event, error)
  }
  type TurnRequest struct {
      SessionID string        // adapter-defined continuity token ("" = new)
      Messages  []Message     // conversation so far (or just the new user turn for session-resuming adapters)
      Tools     []ToolSpec    // available tools (from MCP host); may be empty
  }
  ```
- The core has **no vendor imports**. It ships a deterministic **FakeProvider** (scripted events) so the daemon, Cockpit, and tests work with zero external dependencies — mirroring Cockpit's `local` fallback.

### Claude adapter (package `.../go/agent/adapters/claude`)
Implements `Provider` by driving the installed `claude` CLI (reuses the user's Claude Code auth — no separate key).
- **Invocation:** `claude -p <prompt> --output-format stream-json --verbose` (+ `--resume <session_id>` for continuity). The adapter reads **line-delimited JSON** from stdout and maps events:
  - `system`/`init` → capture `session_id` (return it so the caller can resume)
  - `stream_event` with `delta.type == "text_delta"` → `text_delta`
  - `tool_use` → `tool_call`; `tool_result` → `tool_result`
  - final `result` → `usage` (incl. `total_cost_usd`) then `done`
- **No bidirectional streaming.** `--input-format stream-json` is broken upstream (claude-code#24594). Multi-turn = the daemon stores the `session_id` and re-invokes with `--resume`; each turn is a child process.
- **Auth:** prefer `CLAUDE_CODE_OAUTH_TOKEN` (one-time `claude setup-token`) or `ANTHROPIC_API_KEY`. OAuth in `.credentials.json` does NOT auto-refresh under `-p` (claude-code#28827), so the daemon must use one of those env tokens.
- **Permissions (later, when tools are on):** `--permission-mode acceptEdits` + explicit `--allowedTools`; never `--dangerously-skip-permissions` in the daemon.
- **Testability:** the adapter takes an injectable "runner" (something that, given args+stdin, yields stdout lines) so tests use a fake runner / fixture stream instead of spawning the real CLI. Windows: resolve the binary via PATH; read stdout line-by-line; keep stderr separate.

### Daemon (`cmd/vibe serve`)
Long-lived local process (127.0.0.1). Exposes `POST /v1/turn` returning **Server-Sent Events** (one SSE `data:` line per agnostic `Event`). Selects the provider by name (`fake` default, `claude` when configured). Holds the session map. The daemon is long-lived because the MCP host (M2) needs persistent connections; per-turn Claude calls are child processes underneath.

### MCP host (M2)
Two wiring modes: (a) let the `claude` CLI host MCP via `--mcp-config` (simplest; the adapter parses tool events from the stream); (b) the daemon is its own MCP host and exposes tools to adapters (required for API adapters with no built-in MCP host). Start with (a); move to (b) when API adapters land.

### Cockpit integration (Cockpit repo)
Cockpit talks to `vibe serve` over HTTP+SSE — a new client + a streaming chat surface (and/or a `vibe` provider in the existing turn route). This lands as its own piece in the Cockpit repo.

## Milestones
- **M1 — agnostic core + Claude adapter + chat through the daemon.** (this plan)
- **M2 — MCP host** (your servers → tools in the loop).
- **M3 — more adapters + routing** (codex, cerebras/openai).
- **M4 — installable PWA + polish.** Then the `.vibe` authoring layer.

## Non-goals (SP1)
`.vibe` language execution (later layer), Hermes/system-automation (SP2), the full MCP host (M2), desktop packaging (M4).

## Supersedes
The TS `@vibe/runtime`/LangGraph Phase-3 plan: the runtime core is now this **Go daemon**; the TS POC stays a reference/optional backend.
