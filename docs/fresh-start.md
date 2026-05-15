# Vibe Fresh Start

**Status:** Seed note  
**Date:** 2026-05-15  
**Active repo:** `C:\vibe`  
**Reference repo:** `C:\Hive\vibe`

## Boundary

`C:\vibe` is the new active Vibe repository.

`C:\Hive\vibe` was the reference corpus for this fresh start. Its useful
project machinery has now been intentionally transferred into `C:\vibe`, but
its old repo identity and old assumptions are not binding decisions.

GameSpree is not part of this repo. It is only a future proof target for Vibe.

## Product Posture

Vibe is Vibecade's concrete tool for vibe-coded systems. The working frame is
Agentic Infrastructure as Code: `.vibe` source should eventually describe
agents, lanes, handoffs, gates, provider routes, write scopes, checks, and
human approvals.

The Vibe spec is fluid. This repo should not freeze syntax, naming, provider
strategy, parser/runtime split, or implementation language until a decision is
recorded here.

Long-horizon agents are an eventual execution target for Vibe lanes. They should
not be a dependency of the initial repo or the first source loop.

Dogfooding is a constraint, but not a license to build a large self-hosting
system early. The first dogfood loop is small: use `.vibe` source to describe or
guide Vibe's next repo artifact, then let the repo learn what tooling is needed.

## What Carries Forward

From `C:\Hive\vibe`, carry forward the useful ideas and working machinery, but
not the old repo identity:

- `.vibe` source sits at the center.
- Lanes, handoffs, gates, provider routes, and write scopes are useful public
  vocabulary.
- Existing AI frameworks can be coordinated as backends.
- TypeScript/Langium is the current language layer because the transferred
  parser/test suite already works.
- Go remains a possible local runtime layer for repo safety, subprocesses, and
  coordination, but it is experimental and should not block the first loop.

## Next Step

Use the transferred language package to keep dogfooding:

```powershell
pnpm run self:plan
pnpm test
pnpm run build
```

The next implementation slice should improve the self-plan loop without
pretending the syntax or runtime split is final.

## Current Tooling

The repo now has a TypeScript/Langium source loop:

```powershell
pnpm test
pnpm run self:plan
pnpm run build
```

The generated file in `docs/examples/` is a useful artifact, not the source of
truth. The source of truth remains `examples/vibe-self.vibe`.
