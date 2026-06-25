# Vibe: Expert Analysis (2026-06-06)

**Status:** Local notes only — not for commit. Stored at `C:\vibe\.local\analysis\`.

---

## What Vibe Actually Is

Vibe is **Agentic Infrastructure as Code**: a declarative layer for coordinating AI-assisted development, not another agent framework.

Thesis:

> The repo should not be the coordination mechanism. The repo should be the artifact store. Coordination belongs in Vibe-declared lanes, typed handoffs, worktree isolation, and merge gates.

Stack:

```text
.vibe source (Langium/TS)
  → self-plan JSON + lane IR
  → Go runtime (CLI, handoffs, fan-out, dev-pool, remote C&C)
  → adapter surfaces (Codex, Grok, VS Code, Supabase/Vercel dashboard)
  → external CLI subagents do the real editing
```

It **coordinates** LangGraph, CrewAI, Codex, MCP, etc. It does not try to replace them.

---

## Real Strengths (Not Aspirational)

### 1. Coordination vocabulary that matches how teams actually work

| Concept | Why it matters |
|--------|----------------|
| **Lane** | Scoped unit of work with purpose |
| **Read/write scope** | Prevents agents from trampling each other |
| **Verification gate** | `pnpm run check` isn't optional decoration |
| **Human approval point** | `human.before_commit` before merge/release |
| **Surface** | Same lane, different execution target |
| **Handoff** | Generated, deterministic brief — not copy-paste |

### 2. Honest engineering posture

ADR 0001 admits: `RunLoop` isn't production; lanes compile to markdown handoffs; real work delegated to external CLI subagents with gates. Mature choice over fragile in-process tool loops.

### 3. Long-horizon work as first-class primitive

Autonomous lanes codify startup protocol, Explore→Commit loop, multi-agent roles, `PROGRESS.md` — generated per lane, not hand-pasted.

### 4. Surface-agnostic, repo-grounded contract

One `.vibe` source → handoffs for IDE, cloud, GitHub, remote dashboard. Git = artifact store.

### 5. M3: fan-out + dev-pool with safety rails

Parallel subagents, worktree isolation, gate-or-revert, no-push-by-default, dry-run, STOP sentinel.

### 6. Remote control plane

Supabase C&C + Vercel dashboard + `vibe remote` — steer from anywhere.

### 7. Test coverage

~40+ TS test files, ~25+ Go test files.

### 8. Self-making bootstrap loop

`examples/vibe-self.vibe → self-plan JSON → execution → updated .vibe`

---

## Novelty vs. Existing

| Layer | Alternatives | Vibe's angle |
|-------|-------------|--------------|
| Prompts/rules | AGENTS.md, Cursor rules | Generated, scoped, surface-aware from one source |
| Workflow engines | LangGraph, Temporal | Project/lane coordination above backends |
| Autonomous agents | Devin-style black boxes | Explicit scopes, gates, checkpoints |
| Multi-model | big-AGI beam | Headless fan-out + dev-pool with git safety |
| Cloud IaC | Terraform | Agent/lane IaC — different domain |

**Novelty is real but narrow:** declarative coordination layer for agentic dev, git-grounded, cross-surface. Mental model: **Terraform for how AI work is scoped, handed off, verified, and resumed.**

---

## Worth It?

**Yes** if: multi-agent multi-session dev, auditability, multiple surfaces, long-horizon lanes, M3 dev-pool model.

**No** if: solo dev one agent, need full autonomy today, can't maintain spec, want polished product.

For Vibecade: strategically coherent — it *is* the product thesis.

**Verdict:** Not merely novel. Addresses real gap. Risk is execution through M3 without sacrificing safety.

---

## Gaps and Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Spec fluidity | Medium | Self-plan loop, schema CI, ADRs |
| Execution gap | High | M3 dev-pool |
| Surface area | Medium | Adapter boundary |
| "Just use AGENTS.md" | High for casual users | Autonomous lanes, fan-out, remote C&C |
| Provider asymmetry | Medium | ADR defers in-process tool loop |

Branch context at time of analysis: `feature/m3-continuous-fanout-dev`.