# Nx Workspace Generators for Vibe

## Why perfect for Vibe
Nx generators allow `nx g @vibe/lane my-feature` to instantly scaffold a new autonomous lane: .vibe file, schema update, example, docs, test, Go adapter stub, etc. This supercharges self-improvement and agent scaffolding.

## Setup
1. After adding Nx (`pnpm add nx ...`)
2. Create generators in `tools/generators/` or use built-in.
3. Register in `nx.json` or plugins.

## Example Commands to Implement
- `nx g vibe:primitive provider`
- `nx g vibe:skill checkpoint`
- `nx g vibe:lane production-kuma-review`

## Starter Implementation Steps
1. Use `nx g @nx/js:library tools/generators --buildable`
2. Implement generator in TS with schema.json for prompts.
3. `nx g` will use templates from `files/` dir.

This turns vibe into a generator-powered DSL factory.

Next action: Create actual generator skeleton?
