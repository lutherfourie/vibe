# Vibe Fresh Start Plan

**Status:** Fresh-start plan.
**Date:** 2026-05-15
**Owner:** Luther

## Goal

Restart the Vibe implementation path from a smaller center: a tiny Vibe source
that describes Vibe's own next work. Use the current Go spike only as scratch
until the source proves what tooling should exist.

## Rules

- Default repo is `C:\vibe`.
- GameSpree is a future/reference target, not the active workstream.
- The Vibe Spec is fluid and may change significantly as the project learns.
- Do not freeze naming, architecture, runtime boundaries, or provider strategy
  without a deliberate decision note.
- Prefer reversible artifacts over big framework commitments.

## What To Preserve From The Current Work

- Agentic IaC framing.
- Lanes, handoffs, gates, provider routes, and write scopes as public terms.
- Go as a strong candidate for local runtime mechanics.
- TypeScript/Langium as the current language/editor implementation.
- Existing AI frameworks as execution backends Vibe can coordinate.

## What To Reconsider

- Whether the next implementation should be SD3 `vibe init`, Go runtime, or a
  smaller self-describing `.vibe` file.
- Whether `vibe-doctor`, `vibe-make`, and `vibe-coord` are the right binaries.
- Whether the lane-plan JSON IR should be generated, authored, or replaced.
- Whether Vibe's formal spec name should stay "Vibe Spec" or remain unnamed.

## First Slice

1. Create `examples/vibe-self.vibe`.
2. Keep it intentionally small and readable.
3. Declare Vibe's own identity, repo, provisional lanes, and one human merge
   gate.
4. Add a doc note explaining how tools should compile from that source later.
5. Only after that, adjust Go or TypeScript tooling to consume the source.

## Done

- The repo has a tiny self-describing Vibe source.
- The active fresh-start constraints are written down.
- The current Go code is clearly marked as provisional.
- No existing scratch files are deleted unless the user explicitly asks.
