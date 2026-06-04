# ADR 0001 — Continuous multi-subagent fan-out development (M3)

- **Status:** Accepted (incremental build in progress)
- **Date:** 2026-06-05
- **Branch:** `feature/m3-continuous-fanout-dev` (off `feature/m2-multi-provider-dispatch`)

## Context

Vibe today is an **execution coordinator + observability spine**, not an in-process
development executor. Concretely (verified 2026-06-05):

- `agent.RunLoop` is real and tested but **called nowhere in production**; there are
  **zero `agent.ToolExecutor` implementations** outside tests — so the in-process loop
  cannot edit files or run commands today.
- Lanes (`internal/lanes`) compile to **markdown handoffs**; no runtime executes them.
- The Supabase poller (`vibe remote`) is **C&C only** (pause/resume/instruct/infra-sync),
  not work dispatch.
- Real development has always been delegated to **external CLI subagents** (codex, grok,
  claude) plus an **external gate** (`.autodev/loop.ps1`: tsc/build/roundtrip → commit-or-revert).
- Provider tool-calling is asymmetric: the **OpenAI adapter emits `tool_call` events**, but
  **codex and grok-cli are text-only**. So an in-process tool-using loop would, in practice,
  only drive a single OpenAI-compatible provider — little fan-out value and high risk to build
  from scratch.

M2 added the fan-out primitive (`agent.SpawnParallel` + `PickBest`), the `grok` HTTP provider,
and the `grok-cli` subagent provider — but nothing **consumes** the fan-out for real work yet.

## Decision

Reach "continuous multi-subagent fan-out development" by **leaning into the proven model**
vibe already uses — mature external CLI subagents doing the editing, isolated and gated —
rather than building a fragile from-scratch in-process file-mutator. Build it in **small,
tested, independently-shippable slices**:

1. **`vibe fanout` (slice 1 — this change).** Fan one prompt across N subagents concurrently
   (`agent.SpawnParallel`), summarize/`PickBest`, optionally write each result to a file. Safe
   (works with read-only/text subagents), fully unit-tested, immediately runnable. The keystone
   the rest builds on. Reusable core in `internal/fanout`.
2. **Worktree isolation.** Run an editing subagent inside a throwaway `git worktree` so parallel
   workers never clobber each other; capture the resulting diff.
3. **Gate + commit-or-revert (in Go).** Port the `.autodev/loop.ps1` safety contract into a
   reusable Go harness: run a verify command, then commit scoped paths on green or discard the
   worktree on red. Never pushes.
4. **Continuous dev-pool.** A worker pool that pulls tasks from a backlog, runs each as a
   worktree-isolated subagent, gates, and commits — looping until the backlog drains or a STOP
   sentinel appears. Optional best-of-N per task (fan K subagents at one task, keep a green diff).
5. **`vibe pool` / `vibe dispatch` CLI** wiring 2–4 together, with `--dry-run`, explicit scopes,
   `--workers`, `--verify`, and no-push by default.

## Safety rails (non-negotiable)

- **No push** — every commit stays local for human review.
- **Gate every change** — a change only lands if its verify command passes; otherwise the
  worktree is discarded. A broken change can never be committed.
- **Explicit scopes + worktree isolation** — workers write only inside their own worktree;
  commits stage explicit paths, never `git add -A`.
- **STOP sentinel + dry-run** — the pool halts on a STOP file; `--dry-run` plans without editing.
- **Supervised first use** — an unsupervised, repo-committing pool is **not** pointed at a real
  product repo on night one. Tonight: build + test the pieces; dogfood only **dry-run** or a
  **throwaway sandbox** / read-only analysis fan-out.

## Alternatives considered

- **In-process `ToolExecutor` + `RunLoop` agentic loop.** Rejected for now: requires tool-calling
  across providers (only OpenAI-compatible have it; cerebras is the only one keyed today), and a
  from-scratch file-mutating executor is the riskiest thing to run unsupervised. Kept on the
  roadmap; `RunLoop`'s `Fanout` already exists for when it's warranted.
- **Another ad-hoc PowerShell harness.** Rejected: the user authorized expanding vibe with mature
  practices; a tested Go harness inside vibe is the durable home and is reusable by the daemon.

## Notes

- `internal/fanout` keeps its own provider registry (it intentionally includes `codex`, a great
  read-only analysis subagent) separate from `internal/serve`'s daemon registry (which powers
  `/v1/turn` and carries warn-logging + dispatcher side-effects). A future DRY pass can extract a
  shared `internal/providers` registry if the duplication earns it.
