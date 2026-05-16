# Vibe Now Extension Priority

**Status:** opinionated research note
**Date:** 2026-05-16

Research-agent output and current repo state point to a priority change:
ship a useful VS Code extension before waiting for the full Vibe runtime.

The extension is already close enough to be useful because it has a `.vibe`
language contribution, syntax grammar, Langium language-server startup, command
contributions, and repo-local VS Code tasks. The next useful surface is not
agent execution. It is a cockpit that makes project truth visible.

## Vibe Now Scope

The first extension should do these things:

- Edit `.vibe` files with syntax and diagnostics.
- Show a `Vibe` tree with project, agents, routes, lanes, gates, plugins,
  memory, and problems.
- Create `.vibe/project.vibe`, `.vibe/state.json`, and `.vibe/notes.md`.
- Parse the active `.vibe` file into visible state.
- Generate `.vibe/generated/AGENTS.preview.md`.
- Create an opinionated GameSpree/Pawfall starter contract.

## Deferred

Do not block the extension on:

- full `vibe init`, `vibe sync`, or `vibe build` runtime semantics;
- Obsidian vault generation;
- live LLM hovers;
- agent execution;
- provider auth;
- marketplace publishing;
- Go runtime decisions.

## Product Principle

The extension should make Vibe feel like this:

> I open a repo, and VS Code tells me what the repo believes, which agents are
> allowed to do what, what gates protect the work, and what truths must not be
> violated.

This note is intentionally research-weighted. It is not a locked spec.
