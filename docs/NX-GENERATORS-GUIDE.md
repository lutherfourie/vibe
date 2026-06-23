# Nx Workspace Generators for Vibe

## Why Generators Rock for Vibe
- Auto-create new autonomous lanes with boilerplate (.vibe files, docs, tests, Go stubs, TS packages)
- Enforce conventions across agentic components
- Agents can call `nx g` via tools

## Setup
1. `nx g @nx/plugin:plugin vibe-generators` or manual
2. Extend with your templates.

## Example Commands
`nx g @vibe/lane --name=research-agent --autonomous=true`

This will create:
- packages/lanes/research-agent/...
- examples/research.vibe
- docs/autonomous/research-agent.md

Full implementation coming or add now?