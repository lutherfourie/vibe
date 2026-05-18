# Vibe Workbench Contract

Use this as the shared contract across Codex, Claude Code, MCP, IDE, GitHub, local CLI, and future agent adapters.

## Source Of Truth

- The active Vibe repository (typically the project working directory; on Luther's machine, `C:\vibe`).
- `C:\Hive\vibe` is reference material only unless the user explicitly asks to compare against it.
- `examples/vibe-self.vibe` is the source for Vibe's current self-plan loop.
- `docs/examples/vibe-self-plan.json` is generated output. Regenerate it with `pnpm run self:plan`; do not hand-author it.

## Portable Concepts

Keep these concepts independent of any one assistant's plugin format:

- Lane name and purpose.
- Source files or plans the lane reads.
- Write scope it owns.
- Handoff target or execution surface.
- Validation gate that proves the lane worked.
- Human approval point before merge, release, or external side effects.

## Adapter Boundary

- Codex packaging belongs in `.codex-plugin/`, `.agents/plugins/marketplace.json`, and `codex-skills/`.
- Claude Code packaging belongs in `.claude-plugin/`, `skills/`, `agents/`, and optional `hooks/`/MCP files at the plugin root.
- MCP servers, VS Code extension files, GitHub workflows, local CLIs, and cloud-agent configuration are adapter layers, not the Vibe source format.

## Operating Rules

- Start with `git status --short --branch` and preserve existing dirty work.
- Keep implementation scoped to the requested lane or adapter.
- Prefer report-only checks before adding installation, authentication, hooks, or external-service side effects.
- If a task touches `go/**`, run Go tests when a Go toolchain is available; otherwise report the skip clearly.

## Superpowers Workflow

Use Superpowers as the disciplined execution layer when a Vibe task becomes multi-step, risky, or cross-agent:

- Start with `superpowers:using-superpowers` when the user explicitly asks for Superpowers or when a Superpowers skill may apply.
- Use `superpowers:writing-plans` for multi-step implementation plans. Save Vibe plans under `docs/superpowers/plans/`.
- Use `superpowers:subagent-driven-development` when subagents are available and tasks can be split cleanly.
- Use `superpowers:executing-plans` for inline execution of an existing plan.
- Use `superpowers:systematic-debugging` for unexpected behavior or failing checks.
- Use `superpowers:verification-before-completion` before claiming a task is complete, fixed, or passing.

Map each Vibe lane to a Superpowers workflow before implementation: brainstorm or plan, execute, review, verify, then hand off.
