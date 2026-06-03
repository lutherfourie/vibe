# Autonomous Long-Horizon Work — Survey & Vibe Fit

**Date:** 2026-06-03
**Author:** Claude Code (autonomous session)
**Status:** Research note (informs the autonomous-lanes design spec)

## Why this note exists

Vibe already declares *who* does work (agents, surfaces, providers) and *where*
work is scoped (lanes, write scopes, gates). What it does not yet declare is
*how work survives time*: the durable, recoverable, resume-from-checkpoint
discipline that lets a single unit of work run across many sessions — possibly
days apart, possibly across different agents and surfaces — without losing
scope or repeating itself.

That discipline has a concrete, battle-tested shape: the **base autonomous
long-horizon prompt** Luther uses to drive Claude Code and Codex. This note
analyzes that prompt as a *specification*, maps each of its load-bearing
concepts to a Vibe primitive, and records the secondary inspiration (big-AGI)
we choose to borrow from and what we deliberately leave behind.

## The base autonomous prompt, read as a contract

The prompt is not prose — it is an operating contract with seven load-bearing
clauses. Each is a candidate Vibe primitive:

1. **Core Authorization** — full git/file/tool access; spend resources
   generously; high-effort reasoning. *Vibe fit:* a lane's existing write
   scope + a new "horizon" signal that says "this is long, durable work."

2. **Startup & Resumption Protocol** — always, first: `git pull`, `git status`,
   read `PROGRESS.md` (create if missing), read `README`/arch docs/recent
   commits/`CLAUDE.md`, then resume from the last checkpoint rather than
   restarting. *Vibe fit:* this is a generated, scoped *handoff brief*. Vibe
   already emits handoffs per lane; an autonomous lane emits this protocol.

3. **Structured Workflow Loop** — Explore → Research → Plan → Implement →
   Verify → Test → Commit & Handoff. *Vibe fit:* the body of the autonomous
   handoff. Vibe's `requires` (gates) already names the Verify/Test step; the
   loop names the rest.

4. **Multi-Agent Collaboration** — switch perspectives (Architect, Implementer,
   Researcher, Tester, Reviewer, DevOps); use native sub-agents for independent
   subtasks. *Vibe fit:* an optional `roles` list on the lane; the handoff
   instructs the executing agent to rotate through them.

5. **Branching & Experimentation** — keep main shippable; short-lived feature
   branches; merge after self-review + validation; push for backup. *Vibe fit:*
   the lane's `branch` field + the repo's existing git-automation contract.

6. **Persistence & Long-Horizon Rules** — everything important survives via
   git + files; checkpoint at natural boundaries; `PROGRESS.md` is the single
   source of truth for handoff. *Vibe fit:* **the missing primitive.** Vibe has
   no durable state contract. This is `PROGRESS.md` as a *structured artifact*
   with a Vibe-owned shape, plus a `checkpoint` verb.

7. **Mindset & Quality Bar** — durability over hacks; high agency;
   production-grade where it matters. *Vibe fit:* tone of the handoff; not a
   separate primitive.

**Key insight:** clauses 2, 3, 4, 5, 7 are *text the executing agent reads* —
they belong in a **generated handoff** (a new lane mode). Clauses 1 and 6 are
*state and structure* — they belong in the **lane IR** (a horizon signal) and a
**durable `PROGRESS.md` contract** (a new artifact + verb). This split is the
spine of the design spec.

## What's already in the repo (and what's missing)

Present and reusable:

- `go/internal/lanes` — `Plan`/`Lane` IR, `EmitHandoffs`, per-mode dispatch
  (`codex.web`, `local`), and `ValidatePlan` (non-overlapping write scopes).
- `go/internal/prompts` — `CodexWebHandoff`, `LocalChecklist`; the
  `writeSection` helper; a precedent for embedding a full "operating contract"
  block (the existing GPT-5.5 contract) into a handoff.
- `go/internal/continuation` — a repo-level resume report (`Read First`,
  `Resume Commands`, `Next Moves`). This is resume at the *repo* grain; the
  autonomous lane needs resume at the *lane* grain, anchored on `PROGRESS.md`.
- `schemas/vibe-lane-plan.schema.json` — the canonical IR contract, mirrored
  TS↔Go, CI-gated, with a `mode` enum we extend.
- `.github/workflows/ci.yml` — Go + Node gates; schema drift guard.

Missing (this is the work):

- A lane **mode** that emits the long-horizon operating contract.
- A lane-level **horizon / progress / roles** signal in the IR.
- A **`PROGRESS.md` contract** — a Vibe-owned structured shape for durable
  state, plus a `vibe checkpoint` verb to append to it and a resume reader.

## Secondary inspiration: big-AGI (what we borrow, what we drop)

big-AGI (enricoros/big-AGI) is a mature multi-model client. As of our
knowledge cutoff, the patterns worth *conceptually* borrowing:

- **Beam (multi-model parallel + merge).** Several models answer in parallel,
  then a merge step synthesizes. *Borrow:* the autonomous loop's "Research" and
  "Verify" steps are natural fan-out/merge points; the handoff explicitly
  invites native sub-agents for independent research and adversarial review,
  then merges findings back into `PROGRESS.md`. *Drop:* big-AGI's UI-bound beam
  orchestration — Vibe stays headless and git-grounded.
- **Personas.** Named, reusable system personalities. *Borrow:* Vibe already
  has `persona`; the autonomous `roles` list is the *within-a-run* rotation
  (Architect/Implementer/…), distinct from the *who-is-this-agent* persona.
  *Drop:* nothing; they compose.
- **Auto / agentic mode.** *Borrow:* the spirit of "keep going until done."
  *Drop:* any dependence on a hosted runtime; durability here is files + git,
  not a server session.

We deliberately do **not** copy big-AGI's architecture, storage, or UI. The
borrow is conceptual: fan-out/merge as loop seams, personas-vs-roles
separation, and "durable until done." Everything Vibe emits stays a plain,
paste-ready, git-committed artifact.

## Design implications (carried into the spec)

1. Add `autonomous` to the lane `mode` enum; render the long-horizon operating
   contract as a generated handoff (clauses 2–5, 7).
2. Namespace autonomous-only config under an `autonomous` object on the lane
   (`progress`, `horizon`, `checkpointEvery`, `roles`, `research`) so the
   generic lane stays lean and the config is clearly mode-scoped.
3. Define a **`PROGRESS.md` contract** (clause 6) as a structured artifact with
   a fixed section set, an emit/parse round-trip, and a `vibe checkpoint` verb.
4. Resume is the inverse of checkpoint: read `PROGRESS.md` + git state and print
   the lane-grain resume brief (reuse the continuation report shape).
5. Keep every change TDD, schema-mirrored, and CI-gated, matching the Go
   runtime's established bar.
