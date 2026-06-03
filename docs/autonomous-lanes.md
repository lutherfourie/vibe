# Autonomous Lanes

Autonomous lanes make **long-horizon, durable, resume-from-checkpoint work** a
first-class kind of Vibe lane. Declare a lane as `autonomous` and Vibe generates
a complete, scoped operating brief — the Explore → Research → Plan → Implement →
Verify → Test → Commit loop, the startup/resumption protocol, multi-agent roles,
branching discipline, and the `PROGRESS.md` contract — with no hand-pasting. A
small set of CLI verbs (`vibe checkpoint`, `vibe resume`) keep the work
recoverable across sessions, agents, and surfaces.

## Why

A normal lane says *who* does work and *where* it is scoped. An autonomous lane
adds *how the work survives time*: it can run across many sessions — hours or
days apart, possibly across different agents — without losing scope or repeating
itself. The discipline is the base long-horizon operating contract, turned into
a generated artifact instead of a prompt you paste by hand.

## The two halves

1. **Text the executing agent reads** — the `autonomous` lane **mode**. Running
   `vibe handoff` on a lane-plan emits a paste-ready brief embedding the full
   operating contract, scoped to that one lane's read/write scope and gates.
2. **Durable state & structure** — the **`PROGRESS.md` contract**. A Vibe-owned
   structured file that is the single source of truth for handoff, written and
   read with `vibe checkpoint` and `vibe resume`.

## Declaring an autonomous lane

Autonomous lanes live in the **lane-plan** IR (the JSON execution contract the Go
runtime consumes). Add a lane with `"mode": "autonomous"` and an optional
namespaced `autonomous` config block:

```jsonc
{
  "name": "vibe-demo",
  "repo": "C:/vibe",
  "lanes": [
    {
      "name": "agent-sdk-hardening",
      "mode": "autonomous",
      "branch": "feat/agent-sdk-hardening",
      "reads": ["go/agent/**", "PROGRESS.md"],
      "writes": ["go/agent/**"],
      "prompt": "Harden the Go agent SDK to production grade across sessions.",
      "requires": ["cd go && go test ./...", "human.merge-review"],
      "autonomous": {
        "progress": "PROGRESS.md",
        "horizon": "long",
        "checkpointEvery": "every major step or 30-60 minutes",
        "roles": ["architect", "implementer", "researcher", "tester", "reviewer", "devops"],
        "research": "docs/superpowers/research"
      }
    }
  ]
}
```

A complete, schema-valid example lives at
[`docs/examples/vibe-autonomous-lanes.json`](examples/vibe-autonomous-lanes.json).

### `autonomous` config fields (all optional)

| field             | meaning                                                        | default                              |
| ----------------- | ------------------------------------------------------------- | ------------------------------------ |
| `progress`        | path to the `PROGRESS.md` the lane maintains                  | `PROGRESS.md`                        |
| `horizon`         | freeform horizon signal (`long`, `multi-session`, …)          | omitted from the brief               |
| `checkpointEvery` | checkpoint cadence hint                                        | `every major step or 30-60 minutes`  |
| `roles`           | multi-agent roles the agent rotates through                   | architect, implementer, researcher, tester, reviewer, devops |
| `research`        | research-notes directory the lane appends findings to         | the brief uses a generic Research step |

The block is closed (`additionalProperties:false`): an unknown key fails schema
validation, keeping the schema and the Go `Autonomous` struct in lockstep.

## Generating the handoff

```powershell
# from the go/ directory (or use a built `vibe` binary on PATH)
go run ./cmd/vibe handoff --plan ..\docs\examples\vibe-autonomous-lanes.json --out .\.vibe-out
```

For an autonomous lane this emits a `# Autonomous Lane: <name>` brief containing:

- **Core Authorization** — full git/file/tool access *within the write scope*.
- **Startup & Resumption Protocol** — `git pull` → `git status` → read
  `PROGRESS.md` → read README/arch/commits/CLAUDE.md → resume from the last
  checkpoint, never restart.
- **Structured Workflow Loop** — Explore → Research → Plan → Implement → Verify →
  Test → Commit & Handoff, with the lane's `requires` named as the gates.
- **Multi-Agent Roles** — rotate perspectives; fan out to sub-agents for
  independent research/review, then merge findings back into `PROGRESS.md`.
- **Branching & Experimentation**, **Persistence & Long-Horizon Rules**, and the
  **PROGRESS.md Contract** section set.
- **Task** and **Boundaries**.

The generator is deterministic (no clock, no randomness), so the same lane always
produces the same brief.

## The PROGRESS.md contract

`PROGRESS.md` is the durable spine. It is plain markdown a human can read and a
structured artifact Vibe can parse. Canonical sections:

```text
# <Title>

Status: <one-line state + phase>
Updated: <date>
Branch: <branch>

## Mission          — the durable north star
## Milestones       — checkbox list
## Checkpoint Log   — timestamped entries (newest first)
## Next Moves       — ordered list
## Decisions        — decision: rationale
## Risks / Blockers — open risks (may be empty)
## Resume           — files to read first + commands to run
```

### Checkpoint

Append a timestamped entry at every natural boundary (slice complete, blocker,
phase end) and refresh the front-block:

```powershell
go run ./cmd/vibe checkpoint `
  --summary "Wired the X adapter; tests green" `
  --note "added retry policy" --note "next: backpressure" `
  --status "in-progress — adapter slice done"
```

The append is **surgical**: it inserts the new entry at the head of the
`## Checkpoint Log` and updates `Status:`/`Updated:` while preserving everything
else byte-for-byte. An absent file is scaffolded. `--date` overrides the stamp
(defaults to today); `--progress` points at a non-default path.

### Resume

Print a compact "where was I" brief from `PROGRESS.md` plus live git state:

```powershell
go run ./cmd/vibe resume
```

It surfaces the front-block, the latest checkpoint, the Next Moves, and the
Resume pointers — and warns when the file's branch differs from the checked-out
one. This is the lane-grain counterpart to `vibe continue` (which is repo-grain).

## Inside Claude Code / Codex

The `vibe-workbench` plugin ships two skills that surface this workflow:

- **`vibe-autonomous`** — start or resume an autonomous lane: run the startup
  protocol, read the resume brief, and follow the loop.
- **`vibe-checkpoint`** — checkpoint discipline: append a `PROGRESS.md`
  checkpoint at the right boundaries.

Both are mirrored for Codex under `codex-skills/`.

## Proposed `.vibe` syntax (future)

M1 lands autonomous lanes in the lane-plan IR. A future grammar seam would let
`.vibe` declare them directly, compiling to the same JSON:

```text
// PROPOSED — not yet parsed by packages/language
lane agent_sdk_hardening {
  mode    = autonomous
  branch  = "feat/agent-sdk-hardening"
  reads   = ["go/agent/**", "PROGRESS.md"]
  writes  = ["go/agent/**"]
  prompt  = "Harden the Go agent SDK across sessions."
  requires = ["go test ./...", human.merge_review]

  autonomous {
    progress  = "PROGRESS.md"
    horizon   = "long"
    roles     = ["architect", "implementer", "tester", "reviewer"]
    research  = "docs/superpowers/research"
  }
}
```

Until then, author autonomous lanes as lane-plan JSON.

## Roadmap

- **M1 (done):** `autonomous` mode + generated brief; `PROGRESS.md` contract +
  `checkpoint`/`resume`; skills, templates, docs.
- **M2:** wire autonomous lanes to `vibe serve` so the daemon (which already has
  the agent SDK) can *run* the loop; a `.vibe` `autonomous` grammar seam.

## Design references

- Spec: [`docs/superpowers/specs/2026-06-03-vibe-autonomous-lanes-design.md`](superpowers/specs/2026-06-03-vibe-autonomous-lanes-design.md)
- Research: [`docs/superpowers/research/2026-06-03-autonomous-long-horizon-survey.md`](superpowers/research/2026-06-03-autonomous-long-horizon-survey.md)
- Plan: [`docs/superpowers/plans/2026-06-03-vibe-autonomous-lanes-m1.md`](superpowers/plans/2026-06-03-vibe-autonomous-lanes-m1.md)
