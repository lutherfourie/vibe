# Vibe Fresh Start

**Status:** Seed note  
**Date:** 2026-05-15  
**Active repo:** `C:\vibe`  
**Reference repo:** `C:\Hive\vibe`

## Boundary

`C:\vibe` is the new active Vibe repository.

`C:\Hive\vibe` is a read-only reference corpus for this fresh start. It can
inform decisions, but it does not define the architecture for `C:\vibe`.
Nothing should be bulk-copied from it.

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

From `C:\Hive\vibe`, carry forward the useful ideas, not the scaffold:

- `.vibe` source sits at the center.
- Lanes, handoffs, gates, provider routes, and write scopes are useful public
  vocabulary.
- Existing AI frameworks can be coordinated as backends.
- TypeScript/Langium remains a possible language layer, but is not needed until
  the first source loop demands a parser.
- Go remains a possible local runtime layer for repo safety, subprocesses, and
  coordination, but it is experimental and should not block the first loop.

## Next Step

Build the smallest tool that reads `examples/vibe-self.vibe` and produces a
plain next-work checklist, JSON summary, or next repo artifact. That should come
before a full grammar, VS Code package, provider adapter, Go runtime, or
long-horizon agent integration.
