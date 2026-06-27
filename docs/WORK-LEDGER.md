# vibe — Work Ledger

Durable record of branches, stashes, and PRs that were merged, preserved, or retired
during cleanups — so past work can be found and integrated later when suitable/needed.

## 2026-06-27 — cleanup + PR #50 merge

**Safety restore point:** tag `pre-cleanup-2026-06-27` → `59ba0b7` (main immediately before this cleanup).

### Merged into main
- **PR #50 — "reliable Windows startup daemon for self-build loop (idle + remote + PWA + update)"**
  (branch `feature/windows-self-build-daemon`; merge commit `ed6c073`).
  **Integrated value:** Windows daemon install scripts (`scripts/install-vibe-daemon-task.ps1`,
  `scripts/vibe-daemon.ps1`), PWA (`web/public/manifest.json`, `web/public/sw.js`,
  `web/app/layout.tsx`), web push (`web/app/api/push/{send,subscribe}/route.ts`,
  `supabase/migrations/20260624120000_push_subscriptions.sql`), docs (`docs/WINDOWS-DAEMON-REMOTE.md`).
  - ⚠️ **Discarded from this PR (do NOT re-integrate):** its three Go files
    (`go/cmd/vibe/main.go`, `go/agent/remote.go`, `go/cmd/vibe/daemon.go`) were **truncated
    stubs** from the 2026-06-24 autonomy session — `main.go` was 102 lines vs main's full 534;
    `agent/remote.go` referenced undefined `RemoteControl`/`msg`/`result` and broke the build.
    Main's full, working versions were kept (main already wires the `daemon` command).
    `go build ./...` passes after the merge.

### Preserved (durable on origin — integrate when suitable)
- **`wip/kick-self-build`** (`6175053`, pushed) — preserved from a `git stash`. Contains the
  kick-self-build trigger + `package.json` script additions (self:plan / grok-build dogfood
  loop) + PROGRESS + NX-GENERATORS-GUIDE WIP. Integrate when wiring the **real** self-build loop.
  (Context: `scripts/kick-self-build.js` is currently a 7-line `console.log` stub — see the
  vibe autonomy audit; the real edit→verify→commit capability lives unwired in `internal/devpool`.)
- **`wip/vibe-daemon-pwa-2026-06-24`** (`711e4dc`, pushed) — 2 commits not in main: a daemon +
  PWA self-build WIP checkpoint, and a crewai P0–P5 build *plan* (largely superseded by main's
  actual crewai P2–P5 implementation). Kept for reference; low likelihood of re-integration.

### Retired (fully merged into main — the work IS in main; local branch deleted)
- `feature/m2-multi-provider-dispatch` (`eb8b0c6`) — Grok CLI subagent provider + loop fan-out wiring.
- `feature/m3-continuous-fanout-dev` (`160ebe0`) — loop remote telemetry, langium decls, row persistence.
- `claude/exciting-hopper-903e0d` (`0c38471`) — PR #48 (autonomous-langium-zod), merged; stale worktree pruned.

### Next (separate from this cleanup)
- Highest-leverage autonomy bet (from the 2026-06-27 audit): wire `internal/devpool`
  (edit→verify→commit-on-green / discard-on-red, already built + tested) into a `vibe pool`
  command with a real grok-cli editing runner + the missing merge-back step. That is what flips
  vibe from "emits prompts" to "lands verified commits unattended."
