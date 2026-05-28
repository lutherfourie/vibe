# Vibe Go Agent SDK — M1 implementation plan (piece by piece)

**Spec:** `docs/superpowers/specs/2026-05-28-vibe-go-agent-sdk-design.md` (read it first).
**Repo/branch:** `C:\vibe`, branch `feat/vibe-go-agent-sdk`. Module `github.com/lutherfourie/vibe/go`, Go 1.22.
**Execution:** lead (Claude) dispatches each task to `codex exec`; reviews (spec + quality) before the next. Codex has no session context — each task below is written to be self-contained alongside the spec.

> **For agentic workers:** executed via `delegating-to-codex` (Claude orchestrates, codex implements piece by piece). Not a parallel-team plan.

**Verification gate (every task):** from `C:\vibe\go`, `go build ./...`, `go vet ./...`, `gofmt -l .` (no output), `go test ./...` all green. Stay within the task's stated files.

---

## Task 1 — Agnostic core package (`go/agent`)
**Files (create):** `go/agent/types.go`, `go/agent/event.go`, `go/agent/provider.go`, `go/agent/fake.go`, `go/agent/fake_test.go`, `go/agent/doc.go`
**Produces:** the vendor-neutral interface every adapter implements + a deterministic FakeProvider.
**Depends on:** nothing.

Steps:
- `types.go`: `Role` (const system/user/assistant/tool), `Message{Role Role; Content string}`, `ToolSpec{Name, Description string; Schema json.RawMessage}`, `ToolCall{ID, Name string; Args json.RawMessage}`, `ToolResult{ID, Content string; IsError bool}`, `Usage{InputTokens, OutputTokens int; CostUSD float64}`.
- `event.go`: `EventKind` (text_delta, tool_call, tool_result, usage, error, done). `Event{Kind EventKind; Text string; ToolCall *ToolCall; ToolResult *ToolResult; Usage *Usage; Err string}`. Helper constructors (`TextDelta(string) Event`, etc.).
- `provider.go`: `TurnRequest{SessionID string; Messages []Message; Tools []ToolSpec}` and `Provider interface { Name() string; RunTurn(ctx context.Context, req TurnRequest) (<-chan Event, error) }`. Document the streaming contract: channel is closed after a terminal `done` (or `error`) event; respect `ctx` cancellation.
- `fake.go`: `FakeProvider` implementing `Provider`. `Name() == "fake"`. Configurable scripted output (default: echoes the last user message back as a few `text_delta` events, then a `usage` event with zeroes, then `done`). Must honor `ctx` cancellation between emitted events.
- `fake_test.go`: table tests — collect all events from `RunTurn`, assert ordering (deltas → usage → done), assembled text equals expectation, channel closes, and a cancelled `ctx` stops emission early.
- `doc.go`: package doc summarizing the agnostic contract (1 short paragraph).

Acceptance: package compiles; `go test ./agent/...` green; no imports outside stdlib; FakeProvider usable with zero config.

---

## Task 2 — Claude adapter (`go/agent/adapters/claude`)
**Files (create):** `go/agent/adapters/claude/claude.go`, `go/agent/adapters/claude/parse.go`, `go/agent/adapters/claude/parse_test.go`, `go/agent/adapters/claude/claude_test.go`
**Produces:** a `Provider` that drives the `claude` CLI and maps `stream-json` → agnostic `Event`s.
**Depends on:** Task 1.

Steps:
- Define a `Runner` interface: `Run(ctx, args []string, stdin string) (stdout io.ReadCloser, wait func() error, err error)`. Real impl spawns `claude` (resolved from PATH) with `-p <prompt> --output-format stream-json --verbose` and `--resume <sessionID>` when non-empty; passes auth env through (`CLAUDE_CODE_OAUTH_TOKEN`/`ANTHROPIC_API_KEY`). Keep stderr separate from stdout.
- `parse.go`: pure function consuming line-delimited JSON and emitting `agent.Event`s + capturing the `session_id`. Map: `system`/init → record session_id; `stream_event` text_delta → `TextDelta`; `tool_use` → tool_call event; `tool_result` → tool_result event; final `result` → `usage` (use `total_cost_usd` if present) then `done`. Unknown lines: ignore defensively. Malformed JSON line: skip, don't crash.
- `claude.go`: `Provider` impl with an injectable `Runner` (default = real). `RunTurn` builds the prompt from `req.Messages`, invokes the runner, streams parsed events on the channel, surfaces the captured session_id (expose via a returned value or a callback the daemon can read — keep it simple: emit a final `done` whose payload carries the session id, OR add a `SessionID()` accessor updated after the turn; document the choice).
- Tests use a **fake Runner** returning fixture `stream-json` (include realistic init/text_delta/result lines, plus a tool_use+tool_result pair, plus a malformed line to prove resilience). No real `claude` process in tests.

Acceptance: `go test ./agent/adapters/claude/...` green with the fake runner; parser handles init/text/tool/result/malformed; session_id captured and resumable.

---

## Task 3 — Daemon turn endpoint (`cmd/vibe serve`)
**Files:** extend `go/cmd/vibe/main.go` (and a new `go/internal/serve/serve.go` + `serve_test.go` if cleaner) to add/upgrade the `serve` subcommand.
**Produces:** `vibe serve` exposing `POST /v1/turn` as SSE over the agnostic core.
**Depends on:** Tasks 1–2.

Steps:
- `vibe serve [--addr 127.0.0.1:8787] [--provider fake|claude]` starts an HTTP server.
- `POST /v1/turn` accepts JSON `{sessionId?, messages:[{role,content}], provider?}`; runs the selected `Provider.RunTurn`; streams each `agent.Event` as one SSE `data:` line (JSON-encoded), flushing per event; ends the stream after `done`. Default provider `fake`; `claude` when requested. Hold a session map keyed by client session id.
- `GET /healthz` → 200.
- Test with `net/http/httptest` + the FakeProvider: POST a turn, read the SSE stream, assert events arrive in order and the stream terminates. Don't spawn `claude` in tests.

Acceptance: `go test ./...` green; `vibe serve` boots; `curl -N -XPOST .../v1/turn` with the fake provider streams events.

---

## Task 4 — Cockpit client (Cockpit repo) — SEPARATE, lead-run after Tasks 1–3
**Repo:** `C:\Users\4elut\Documents\Cockpit`. A thin client + minimal streaming chat surface that calls `vibe serve` `/v1/turn` and renders the agnostic events. Spec'd in its own slice once the daemon is verified (kept out of this Go plan; lives in the Cockpit codebase, not driven by codex against the Go module).

---

## Out of scope for M1
MCP host (M2), real Claude tool execution/permissions, codex/openai adapters (M3), PWA (M4), `.vibe` execution.
