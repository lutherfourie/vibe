# Vibe Transfer Initialization

**Date:** 2026-05-15
**Active repo:** `C:\vibe`
**Reference source:** `C:\Hive\vibe`

## What Happened

`C:\vibe` started as a tiny fresh seed repo. It has now been inflated into the
real working Vibe repo by transferring the useful machinery from
`C:\Hive\vibe`:

- TypeScript/Langium language package
- VS Code extension scaffold
- `.vibe` examples and fixtures
- transferred specs, plans, and research notes
- self-plan extraction work
- provisional Go runtime spike
- pnpm workspace configuration

The transfer does not make old assumptions final. Historical docs may still
mention `C:\Hive\vibe`; treat those as historical context unless a current doc
under `C:\vibe` reaffirms the decision.

## Current Source Of Truth

- Active repo: `C:\vibe`
- Fresh-start boundary: `docs/fresh-start.md`
- Self-describing Vibe source: `examples/vibe-self.vibe`
- Generated self-plan: `docs/examples/vibe-self-plan.json`

## Verification

Use:

```powershell
pnpm install
pnpm run self:plan
pnpm test
pnpm run build
pnpm run check
```

Go spike verification remains blocked until a Go toolchain is installed.
