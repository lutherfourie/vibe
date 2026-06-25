# Grok Build — Long-Horizon Autonomous Development of Spineflow via Vibe (v2)

> Paste this as the build task for `grok build`. Run it from `C:\GameDev\vibe` (the control
> plane) with Spineflow visible at `..\spineflow`. It runs a **durable, resume-from-checkpoint,
> multi-agent** workflow — not a one-shot — toward a living, self-initiating symbolic memory with
> an exquisite visual editor.

---

## ROLE

You are an expert memory-systems + agentic-infrastructure engineer **and product designer**,
running a **long-horizon, durable, autonomous** build. Mission: evolve **Spineflow** (the "Living
Memory Spine", `C:\GameDev\spineflow`) by **driving it through Vibe** (the agentic administration
plane, `C:\GameDev\vibe`). Vibe is the control plane; Spineflow is the memory substrate. You ship
small human-confirmable slices, survive restarts via the `PROGRESS.md` contract, and **prove every
change with real conversations.**

## NORTH STAR — two intertwined pillars

**A. Invert the arrow: agentic autonomy (AI → user).**
Every mainstream AI tool is `user → AI` — the human invokes, the AI reacts. Spineflow's defining
purpose is the opposite direction: `AI → user`. The model becomes a **living collaborator that
initiates** — it surfaces a parked thread, follows up on an open question, flags a contradiction
across time, delivers a reflection insight, proposes or takes an action — **driven by memory state
+ Vibe triggers/autonomous lanes**, not by a user prompt. A memory that *acts*, not a store that
waits. This is the point of the project; **thread autonomy through every epic**, don't bolt it on
at the end.

**B. The exquisite Spineflow Editor: a live symbolic-memory IDE.**
Make the inspectability promise *tangible and delightful*. A real-time visual canvas of the memory
graph — canonical nodes, claims as labeled edges with **Penman** rendering, **color-coded
resolution states** (resolved / weak / ambiguous / unresolved), provenance timelines, namespace
subtrees — with **direct manipulation** (drag-to-relink, natural-language correction →
`resolution_hints` + linker supersession), **"explain this link"** (the exact scoring path the
linker took), subgraph **export** (Penman / Graphviz / interactive HTML), **replay + editable
history**, and a **what-if** simulator. It is both the thing people demo and fall in love with
**and** the cockpit through which the human supervises the autonomous AI (pillar A).

Both pillars ride on a resurrected symbolic substrate and are governed by the laws below.

## CRITICAL GROUND TRUTH — read before assuming anything

The "insane mode" brief that motivates this work (compilation units, canonical graph, resolution
table, Penman views, conservative linker, hybrid reasoner, `ClaimIR`, `SymbolKind`, Abathur,
`FileBackedGraphStore`) describes Spineflow's **pre-rebuild symbolic architecture**. **That
substrate does NOT exist in current `C:\GameDev\spineflow` main** — it is on a *disjoint*
pre-rebuild git history and was lost in the rebuild. Current main is a **flat `MemoryRecord`**
model (`src/spineflow/memory/models.py`) with exact-match alias resolution and retrieval lanes.
**The editor cannot render a graph that isn't there.** So the substrate is resurrected FIRST
(Epic 0), then the editor, reflective loops, simulation, and autonomy ride on it. Verify this in
Phase 0; do not take the brief's class names as present.

### Read first, in order
1. `C:\GameDev\spineflow\docs\2026-06-25-forward-plan.md` — roadmap, cards F-0030–F-0034, the
   **salvage list** (S1 temporal claims, S2 deferred links) the substrate depends on.
2. `C:\GameDev\spineflow\docs\architecture.md` — **the LAWS** (see CONSTRAINTS).
3. `C:\GameDev\spineflow\ops\features\INDEX.md` + the cards. **F-0030 (Bitemporal Fog) is
   implemented, awaiting_confirmation** — it shipped the validity-window half of Epic 0.
4. `C:\GameDev\spineflow\spineflow.vibe` — the Vibe⇄Spineflow binding (`memory { kind = spineflow,
   namespace, fog_threshold }` + `agent { … uses = [plugin…] }`).
5. Existing UI assets to build the editor on: `C:\GameDev\spineflow\extensions\living-memory-browser`
   (WXT/React) and `src\spineflow\api\static\chat` (static UI); the telemetry provenance already
   emitted by `src\spineflow\telemetry`.
6. Vibe: `docs\autonomous-lanes.md`, `docs\adr\0001-continuous-fanout-dev-pool.md`,
   `examples\05-memory.vibe`, `examples\07-trigger.vibe`, `examples\08-agent.vibe`, `PROGRESS.md`.

## CONSTRAINTS — Spineflow's laws (violating these = failed task)

- **Anti-Heuristic Rule.** No heuristic/regex/NLP understanding of raw user turns. **Claim and
  reference EXTRACTION stays model-based structured output.** *Reconciliation:* the linker's
  **reference-resolution scoring** (recency, namespace overlap, neighborhood over already-extracted
  symbols) is **deterministic mechanical ranking, which the architecture explicitly permits** — not
  pseudo-understanding of user text. Keep that line bright.
- **Boundary Rule — applies to autonomy too.** The base model is the author. For an `AI → user`
  proactive turn, **the model writes the message**; Spineflow supplies only the trigger + memory +
  constraints. Initiative is **consented and rate-limited** (no nagging): the human can
  approve/snooze/mute, and unsolicited turns are capped and gated on a genuine signal.
- **Eval thesis (defend every cycle):** *does the SAME base model produce BETTER conversations WITH
  the spine than without?* No demonstrable lift → it does not ship.
- **Feature-card discipline.** Every change = one card under `ops/features/` with a `feature.md`
  contract + a `receipt.md` of evidence; **done only when a HUMAN can confirm the receipt.**
  Smallest useful slice; no multi-feature drops; no "while I'm here" expansion.
- **Safety rails (aligned with Vibe's `vibe pool` contract):** branch per feature; gate every
  change on `requires` (tests + `ruff` + `doctor`); worktree-isolate parallel editors; stage
  explicit paths, never `git add -A`; **NEVER push or rewrite a git remote** (local commits only);
  honor a `STOP` sentinel; dry-run first. Provider = Cerebras `zai-glm-4.7`. No secrets in code.

## DRIVE IT THROUGH VIBE (this is "develop Spineflow using Vibe")

The Go module lives in `C:\GameDev\vibe\go` (NOT the repo root — that's why `go run ./cmd/vibe`
from the root failed). NOTE: `.\bin\vibe.exe` is STALE (May 2026) and predates autonomous lanes —
it rejects `mode:"autonomous"`. Use the newer root `.\vibe.exe` (verified working), or build fresh:

```powershell
# Primary — the newer root binary (supports mode:"autonomous"):
.\vibe.exe handoff --plan .\spineflow-autonomous-lane-plan.json --out .\.vibe-out

# Guaranteed-fresh from source (Go 1.26+; module is under go\). Refreshes bin\ too:
cd go;  go build -o ..\bin\vibe.exe ./cmd/vibe;  cd ..;  .\bin\vibe.exe handoff --plan .\spineflow-autonomous-lane-plan.json --out .\.vibe-out
```

This emits `.\.vibe-out\living-symbolic-memory.md` — the durable operating brief Grok reads.

Then operate the durable lane:

1. **Baseline.** In `C:\GameDev\spineflow`: `python -m pytest -q` + `python -m spineflow.cli doctor`
   (record pass counts + the one known-pre-existing openapi-freshness failure).
2. **Generate the brief** with the command above → a `# Autonomous Lane: living-symbolic-memory`
   brief with the Startup/Resumption Protocol, the Explore→Research→Plan→Implement→Verify→Test→Commit
   loop, multi-agent roles, branching discipline, and the `PROGRESS.md` contract. Read it; follow it.
3. **Durable state.** Maintain `C:\GameDev\spineflow\PROGRESS.md` (Mission, Milestones, Checkpoint
   Log, Next Moves, Decisions, Risks/Blockers, Resume). `vibe checkpoint` after every slice or
   30–60 min; on restart `vibe resume` and **continue from the last checkpoint — never restart.**
4. **Multi-agent fan-out.** `vibe fanout` (parallel subagents → PickBest) for research/review; the
   gated, worktree-isolated `vibe pool`/`vibe dispatch` for parallel editing once supervised. Use
   `codex` (read-only) for audits, `grok-cli` for build subagents.
5. **Live surfaces + the autonomy driver.** Keep Spineflow API (`spineflow serve`) and the Vibe
   daemon (`:8787`) running. Bind Spineflow as `kind = spineflow` memory in a `.vibe` file, and use
   **Vibe triggers (`examples\07-trigger.vibe`) + autonomous lanes as the engine that fires the
   `AI → user` proactive turns** from memory state.

## EPIC LADDER (substrate first; then the editor + alive loops; autonomy threaded; moonshots last)

Work top-down; within each epic ship the **next-best feature** as one card, prove it by
conversation, checkpoint, continue. Re-score each cycle from research + the forward plan.

- **Epic 0 — Resurrect the symbolic substrate** (prerequisite for everything)
  - F-0030b: wire the shipped fog/decay/validity work into the live retrieval lanes +
    reinforcement-on-recall (`ops/features/F-0030…/receipt.md` → "what is still incomplete").
  - Deferred/probabilistic linking + a **resolution table** (salvage S2): a `DeferredLinker` +
    `ResolutionState` (RESOLVED/WEAK/AMBIGUOUS/UNRESOLVED) over `MemoryRecord`, so uncertain refs
    are parked for later correction, not dropped.
  - Canonical-node/claim graph + **Penman view** rendering + an associative (Hebbian) edge layer.
- **Epic 1 — The exquisite Spineflow Editor** (highest-leverage demo + autonomy cockpit)
  - Real-time visual canvas (web app; reuse the `extensions/living-memory-browser` React/WXT stack
    or a standalone surface; add graph/inspection API endpoints): canonical nodes, claims as
    Penman-labeled edges, **color-coded resolution states**, provenance timelines, namespace subtrees.
  - **Direct manipulation:** drag-to-relink and natural-language correction ("actually I meant the
    other backend when I said rendering") → `resolution_hints` + live linker supersession.
  - **"Explain this link":** surface the exact scoring path (recency / namespace / neighborhood
    overlap) + candidate set. Inspectable, never a black box.
  - **Export** any subgraph as Penman / Graphviz / interactive HTML; **shareable redacted /
    time-boxed snapshots** for demos and pair-debugging.
  - **Replay + editable history:** replay a conversation while editing past resolutions/hints and
    watch downstream claims update or conflict.
  - **Autonomy cockpit:** a live feed of the AI's pending/past initiatives (nudges, contradictions,
    reflections) the human can approve / snooze / mute — closing the `AI → user` loop with steering.
  - **Exquisite bar:** fast, legible, keyboard-driven, smooth animation on merge/supersession,
    dark-mode, zero-jank. This is the surface people fall in love with — treat polish as a feature.
- **Epic 2 — Self-improving / reflective loops** (makes memory feel alive + feeds autonomy)
  - Periodic reflection passes: cluster claims into higher-order structures (plans, mental models,
    contradiction sets) → propose new canonical nodes/claims (model-authored, human-confirmable).
  - Consistency engine via Penman + reasoner: detect supersession/contradiction with confidence;
    auto-generate `CORRECTS` candidates from user signals or self-detected drift.
  - **Memory-health dashboard** in the editor: uncertainty density, link-strength distribution,
    temporal-supersession rate, namespace fragmentation. These signals also fire proactive turns.
- **Epic 3 — Memory simulation & what-if** (cheap via unit/canonical separation)
  - Fork graph state, apply hypothetical claims/resolutions/hints, run the reasoner/query sets:
    "what would the agent believe if we accepted this correction?"; branching timelines for
    coaching/planning agents; diverging claim-graph diffs visualized in the editor.
- **Epic 4 — Agentic autonomy surface (AI → user), the payoff**
  - A **proactive-turn mechanism**: memory/reflection/thread/contradiction signals + Vibe triggers
    cause the model to **initiate** a message or action. Consented, rate-limited, base-model-authored
    (Boundary Rule). Surfaced + steerable in the editor cockpit. Deliver as small slices
    (e.g. due-thread follow-up → contradiction flag → reflection digest → proposed action).
- **Epic 5 — Moonshots** (re-score as research warrants)
  - CRDT collaborative memory fabric (Loro op-CRDTs over `add_claim`/`propose_resolution`/
    `apply_correction`; linker deterministic on merge) + Vibe-lane federation; multimodal/code-symbol
    claims (`SymbolKind` for AST nodes — huge for coding agents); a memory-OS abstraction;
    a public benchmark suite (long-horizon pronoun-resolution-with-corrections, consistency under
    contradiction, namespace-isolated multi-user merge) that beats mem0/Zep on axes that matter.

## THE CYCLE (repeat per shipped feature; fan out agents per phase)

0. **Orient** — Startup/Resumption protocol; baseline; pick the active epic's next-best card.
1. **Research (fan out)** — *web:* symbolic/agent memory SOTA, graph-IDE UX, reflective-memory
   (Generative Agents), local-first/CRDT (Loro, iroh, Kleppmann), mem0/Zep/Letta; *local:* the
   salvage list + dormant seams (`fog_threshold`, narratology RETCON/MOTIF, `BranchManager`
   off-hot-path, CLI-only dual-probe). Append findings to `docs/research/`.
2. **Next-best-feature (council)** — score within the active epic on impact × novelty × effort ×
   demonstrable-lift; commit to ONE; justify in `PROGRESS.md` Decisions.
3. **Develop via Vibe** — write `feature.md`; implement the smallest slice; extend `.vibe`
   declarations; obey the laws; unit + integration tests. (Designer role owns editor polish.)
4. **Demo / PoC + use cases** — a runnable demo end-to-end through Vibe + 2–3 concrete user-facing
   use cases (who/when/why-it-helps). For autonomy epics, demo the **AI reaching out unprompted**;
   for the editor, a recorded walkthrough of a correction round-trip.
5. **Test via conversation (non-negotiable)** — drive Spineflow with real multi-turn conversations:
   - **A/B dual-probe:** `run_live_dual_probe` (`evals/live_compare.py`) — same Cerebras model,
     spine ON vs OFF — report `turn_pass_rate` + `conversation_survival_rate`.
   - **Transcript packets:** correction-holds, boundary-respect, unfinished-thread; **author new
     packets** stressing this feature.
   - **Live + adversarial:** `tools/live_conversation_probe.py` + suites you design (correction
     under noise, contradiction across time, parked-thread revival, long-range recall).
   - **Autonomy-specific:** scenarios where the AI *should* initiate (a due open question, a fresh
     contradiction, a reflection insight) and must reach out correctly — and negative cases where it
     must **stay silent** (no nagging); assert rate-limit + consent are honored.
   - **Editor-specific:** graph render matches store truth; a drag/NL correction produces the right
     `resolution_hint` + supersession and the downstream claims update; "explain this link" matches
     the linker's actual scoring.
   - **Score** the human dims (naturalness, usefulness, correction-handling, credibility,
     desire-to-continue). **Ships only on demonstrated lift vs spine-OFF.**
6. **Receipt + handoff** — write `receipt.md` (files, tests, conversation evidence, what's
   incomplete), set the card `awaiting_confirmation`, update `INDEX.md`, commit on the feature
   branch (**no remote push**), `vibe checkpoint`, propose the next cycle's top candidate.

## OUTPUT & CADENCE

- Short checkpoint after every phase (what ran, results, decision) → `PROGRESS.md` Checkpoint Log.
- End each cycle with: shipped feature, A/B lift numbers, the conversation transcripts that prove
  it, the use cases, and the human-confirmable receipt path. Then start the next cycle.
- Be decisive; prefer evidence over claims; **never report a feature done without conversation proof
  and a receipt a human can check.** When blocked on `human.merge-review`, checkpoint and continue
  research / the next card rather than stalling.
