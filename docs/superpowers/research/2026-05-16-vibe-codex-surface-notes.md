# Vibe Codex Surface Notes

**Status:** Research note, not specification.
**Date:** 2026-05-16
**Owner:** Codex
**Confidence:** Medium. This is based on current OpenAI Codex docs and the current `C:\vibe` repo shape. It is intentionally opinionated and may become stale as Codex changes.

## Why This Exists

The current Vibe spec treats `provider openai.codex { mode = cli }` as a route target. That is useful, but probably incomplete.

Codex is not only an LLM provider. It is also a set of execution surfaces:

- local desktop/app work inside a repo
- CLI/headless work
- IDE extension work
- cloud task work
- GitHub pull-request review and `@codex` task comments
- skills, plugins, apps/connectors, MCP servers, subagents, AGENTS.md, and project-scoped config

This note explores whether Vibe should model those execution surfaces separately from providers. This is research, not a committed language decision.

## Current Official-Docs Snapshot

OpenAI's Codex customization docs currently recommend building up Codex support in this rough order:

1. `AGENTS.md` for repo conventions.
2. Existing plugins when a reusable workflow already exists.
3. Skills for locally authored repeatable workflows; package them as plugins when sharing.
4. MCP when workflows need external systems.
5. Subagents for specialized or noisy delegation.

Relevant official docs:

- Codex customization: https://developers.openai.com/codex/concepts/customization
- Codex plugins: https://developers.openai.com/codex/plugins
- Codex quickstart: https://developers.openai.com/codex/quickstart
- Codex GitHub integration: https://developers.openai.com/codex/integrations/github
- Codex config reference: https://developers.openai.com/codex/config-reference
- Codex subagents: https://developers.openai.com/codex/subagents
- Codex app server external-agent migration: https://developers.openai.com/codex/app-server

## Working Hypothesis

Vibe should probably distinguish:

- `provider`: who answers model/API requests.
- `surface`: where a lane is executed, supervised, or handed off.

That would let Vibe say "use OpenAI Codex" without collapsing together local app work, CLI work, GitHub PR comments, and cloud tasks.

Candidate shape:

```vibe
surface codex.local {
  kind     = codex
  mode     = local
  guidance = "AGENTS.md"
  skills   = "./.agents/skills"
}

surface codex.cli {
  kind   = codex
  mode   = cli
  binary = "codex"
}

surface codex.cloud {
  kind         = codex
  mode         = cloud
  environment = "chatgpt.com/codex"
}

surface codex.github_pr {
  kind    = codex
  mode    = github_pr
  trigger = "@codex"
}
```

Candidate lane metadata:

```vibe
plugin local_toolkit_lane {
  impl     = "./tools/local-toolkit-lane"
  target   = surface.codex.local
  reads    = ["README.md", "docs/fresh-start.md", "examples/vibe-self.vibe"]
  owns     = "docs/local-toolkit.md go/** packages/**"
  verify   = ["pnpm run self:plan", "pnpm test", "pnpm run build"]
  approval = human.before_commit
  emits    = "small vibe CLI plan for doctor, lanes, handoff, verify, and memory"
}
```

## Why It Feels Useful

The Vibe questions that matter for Codex are operational:

- Is this a local edit, a CLI/headless run, a cloud task, or a PR-context task?
- Which files should Codex read first?
- Which files may Codex write?
- Which checks prove success?
- Should Codex commit, open a PR, push to a branch, or stop at a diff?
- Which human approval is required before external side effects?
- Is this better as AGENTS.md guidance, a Codex skill, a plugin, MCP config, a custom subagent, or a GitHub `@codex` comment?

Those are not provider-routing questions. They are execution-surface and handoff questions.

## Current Repo Experiment

As of this note, `C:\vibe` has an experimental implementation that parses `surface` declarations and extracts them into the self-plan artifact. Treat that as a prototype, not final language design.

Files involved:

- `examples/vibe-self.vibe`
- `packages/language/src/vibe.langium`
- `packages/language/src/self/self-plan.ts`
- `docs/examples/vibe-self-plan.json`

This may be reverted, renamed, or folded into another primitive after more research.

## Risks And Uncertainty

- `surface` may be the wrong word. Alternatives: `target`, `executor`, `host`, `adapter`, `runtime`, `environment`.
- Some details may belong in lane metadata rather than a top-level primitive.
- Codex docs and plugin mechanics are moving quickly. Treat the official docs as source of truth.
- Claude Code, GitHub, IDEs, and MCP may need a different abstraction. A Codex-shaped primitive could overfit.
- `provider openai.codex { mode = cli }` might remain enough for early Vibe if handoff generation stays simple.
- The line between Codex plugin, Codex skill, repo-local `.agents/skills`, and project `AGENTS.md` should stay practical, not taxonomic.

## Opinionated Current Recommendation

Keep the idea, but keep it experimental.

Vibe should support Codex initially by generating or validating:

- repo guidance: `AGENTS.md`
- repo skills: `.agents/skills/**/SKILL.md`
- optional installable plugin packaging
- handoff prompts for local, CLI, cloud, and GitHub PR contexts
- explicit `reads`, `owns`, `verify`, and `approval` lane fields

Do not build broad global Codex configuration or credentials into Vibe by default. Prefer repo-local artifacts and report-only checks until a human chooses external side effects.

## Validation Questions

Before promoting this into a stable spec:

1. Can `vibe handoff` generate a materially better Codex local prompt from `surface.codex.local` than from plain lane metadata?
2. Can the same `surface` concept express Claude Code without awkward field names?
3. Can `vibe doctor` report Codex readiness without requiring credentials or mutating global config?
4. Can Vibe generate both Codex and Claude handoffs from the same lane without losing important permission semantics?
5. Does `surface` help prevent cross-agent write conflicts, or is `owns` enough?

## Relation To Existing Research

This note narrows the broader ecosystem research in `2026-05-13-codex-claude-ecosystem-survey.md` and `2026-05-15-vibe-agentic-iac-framework-map.md` to one question:

> Should Vibe model Codex as an execution surface distinct from an LLM provider?

Current answer: probably yes, but only as an experimental design path until it proves itself in the local toolkit and handoff workflows.
