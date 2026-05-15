# Vibe

Vibe is Vibecade's concrete tool for vibe-coded systems: a small source format
and future runtime for declaring agentic infrastructure as code.

This repository, `C:\vibe`, is the new active home for Vibe. The older
`C:\Hive\vibe` repository is reference material only. Its ideas can be mined,
but its package layout, grammar, runtime split, and provider strategy are not
binding decisions for this repo.

## Seed Shape

This repo starts from the smallest useful source artifact instead of framework
scaffolding:

- `examples/vibe-self.vibe` describes Vibe's own next work.
- `docs/fresh-start.md` records the repo boundary and carry-forward ideas.
- No TypeScript/Langium package is present yet.
- No Go runtime is present yet.
- Long-horizon agents are an eventual execution target for Vibe lanes, not a
  dependency of this initial seed.

The spec is intentionally fluid. Naming, syntax, backend choice, and the split
between parser, runtime, providers, and generated artifacts should change as the
first working loop teaches the repo what it needs.

Dogfooding is part of the project shape: when Vibe needs a next repo artifact,
describe that artifact in `.vibe` first, then add only the tooling required to
make that source useful.

## Carry Forward

These ideas survived the fresh start:

- Vibe is Agentic IaC for vibe-coded systems.
- `.vibe` is the source format.
- Public coordination vocabulary includes lanes, handoffs, gates, provider
  routes, and write scopes.
- Existing AI frameworks should be usable as backends instead of replaced.
- Go may become a local runtime layer for process supervision, repo safety, and
  lane coordination, but it is experimental until the source loop needs it.

## First Working Loop

1. Keep `examples/vibe-self.vibe` human-readable and small.
2. Add the smallest checker or reader that can validate the source and emit a
   next-work checklist or guide the next repo artifact.
3. Use that generated or guided artifact to update the repo.
4. Decide from that loop whether `packages/language/` is needed.
5. If TypeScript/Langium or Go is added, add working build and test commands in
   the same slice.

There are no package-manager scripts yet because there is no code package. The
current verification is structural: the seed files exist, the active/reference
repo boundary is documented, and the next implementation step is explicit.
