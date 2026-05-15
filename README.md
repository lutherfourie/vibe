# Vibe

Vibe is Vibecade's concrete tool for vibe-coded systems: a hybrid specification
language and future runtime for declaring agentic infrastructure as code.

This repository, `C:\vibe`, is the new active Vibe home. The older
`C:\Hive\vibe` repository was used as a reference and transfer source, but it
is no longer the active workstream.

The spec is intentionally fluid. Naming, syntax, backend choice, and the split
between parser, runtime, providers, generated artifacts, and long-horizon
agents should change as the repo learns.

## Status

`C:\vibe` has been inflated from the old reference repo into a working monorepo:

- `packages/language` contains the current TypeScript/Langium parser,
  dispatcher, resolver, provider shims, self-plan extractor, and tests.
- `packages/vscode-extension` contains the thin VS Code extension scaffold.
- `examples/vibe-self.vibe` is the current self-describing source for Vibe's
  near-term work.
- `docs/superpowers/` contains the transferred specs, plans, and research notes.
- `go/` contains a provisional Go runtime spike. It is source-only until a Go
  toolchain is available.

## Commands

```powershell
pnpm install
pnpm run self:plan
pnpm test
pnpm run build
pnpm run check
```

`pnpm run self:plan` extracts a JSON self-plan from
`examples/vibe-self.vibe` into `docs/examples/vibe-self-plan.json`.

## Bootstrap Loop

```text
examples/vibe-self.vibe
  -> packages/language self-plan extractor
  -> docs/examples/vibe-self-plan.json
  -> human/agent execution
  -> updated .vibe source
```

This is the first dogfood loop. It is not final self-hosting. Long-horizon
agents are an eventual execution target for Vibe lanes, not a dependency of
the initial setup.

Vibe also needs to know where a lane is being managed from. A lane may be
started or supervised from a local desktop, phone, web session, IDE, GitHub, or
cloud agent, but the contract should stay repo-grounded: source, branch,
handoff, write scope, validation gate, and human approval.

## Repo Layout

```text
vibe/
├── docs/
│   ├── examples/
│   ├── fresh-start.md
│   └── superpowers/{plans,research,specs}/
├── examples/
├── go/
├── packages/
│   ├── language/
│   └── vscode-extension/
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```
