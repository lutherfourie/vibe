# Vibe CrewAI Integration Notes

**Status:** Opinionated research note, not specification.
**Date:** 2026-05-16
**Owner:** Codex
**Confidence:** Medium. CrewAI and OpenAI agent surfaces are moving quickly, so
keep this report-only until the lane proves value inside Vibe.

## Decision

Vibe should treat CrewAI as a backend execution surface and adapter target, not
as the Vibe control plane and not as the Vibe source format.

That means CrewAI can execute a lane later, but Vibe should still own the repo
contract:

- lane name and purpose
- read scope and write scope
- provider and execution surface
- tool and MCP exposure
- checkpoint and resume expectations
- human approval gate
- verification command before merge or runtime side effects

## Why CrewAI Fits

CrewAI is useful where Vibe needs a Python-native multi-agent backend with
crews, agents, tasks, flows, memory, checkpointing, human feedback, and MCP
tools. The current CrewAI docs index exposes all of those concepts through
machine-readable documentation, which makes it a plausible target for generated
adapter guidance.

The strongest Vibe overlap is:

- `provider` and `route` map to CrewAI LLM configuration.
- `persona` maps to CrewAI agent role, goal, and backstory.
- `plugin` maps to a CrewAI tool, MCP tool, or task bundle.
- `surface crewai.local` maps to a local Python execution backend.
- `lane`-shaped plugins map to CrewAI Flows, tasks, or crews.
- `gate` maps to human feedback or human-in-the-loop review.
- `memory` maps to CrewAI memory or knowledge only when Vibe/Spineflow remain
  the authority for durable project memory.
- `trace` and run history can later map to CrewAI event listeners,
  checkpointing, and OpenTelemetry-style exports.

## Why CrewAI Should Not Be First

The immediate Vibe problem is not agent runtime selection. It is making the
repo's beliefs, lanes, gates, and assistant handoffs visible in VS Code and the
local CLI.

Do not install CrewAI, mutate user-local MCP config, or add credentials as part
of this lane. The first CrewAI step should be a report-only adapter note and a
self-plan surface so the Vibe cockpit can show CrewAI as a possible backend
without pretending runtime execution exists.

## Mapping Sketch

```text
Vibe source
  provider / route      -> CrewAI LLM configuration
  persona               -> Agent role, goal, backstory
  plugin tool           -> Tool, MCPServerAdapter tool, or task helper
  plugin lane           -> Flow step, task group, or crew
  gate                  -> human_feedback / HITL approval
  memory                -> CrewAI memory or knowledge, with Vibe as authority
  surface crewai.local  -> local Python project generated on demand
```

## Near-Term MVP

1. Keep `surface crewai.local` in `examples/vibe-self.vibe`.
2. Keep `crewai_adapter_lane` report-only.
3. Let `pnpm run vibe:lanes` show CrewAI as a possible backend lane.
4. Teach the VS Code tree to show backend surfaces beside Codex and Claude.
5. Add a later explicit command such as `Vibe: Generate CrewAI Adapter Preview`
   before creating Python files.

## Non-Goals

- No automatic CrewAI installation.
- No edits to user-local `mcpServer.*CrewAI*` config.
- No secrets or provider auth.
- No runtime agent execution.
- No replacement of the Go local toolkit or TypeScript/Langium parser.
- No claim that CrewAI checkpointing is mature enough to be Vibe's durable
  workflow engine for every long-horizon task.

## Open Questions

1. Should Vibe generate a CrewAI Flow, a Crew, or both for each lane?
2. Should Vibe expose MCP servers directly, or generate CrewAI MCP adapter code
   only after a human approves the server list?
3. Should CrewAI checkpoints be treated as runtime-local state while Vibe keeps
   the canonical lane/run state in repo files or a future database?
4. How much of `AGENTS.md` and `CLAUDE.md` should be converted into CrewAI
   agent instructions instead of linked as guidance?
5. Should CrewAI be a first-class `surface` only, or should Vibe later grow
   framework-specific adapter blocks?

**P4 complete (2026-06-25):** static prove delivered (examples/crewai-smoke.vibe + language/go tests exercising compile + iac-compile + py_compile). Self-plan JSON source not supported by compiler (deferred P5).

## Sources

- CrewAI docs index: https://docs.crewai.com/llms.txt
- CrewAI MCP overview: https://docs.crewai.com/en/mcp/overview
- CrewAI Flows: https://docs.crewai.com/en/concepts/flows
- CrewAI checkpointing: https://docs.crewai.com/en/concepts/checkpointing
- CrewAI human feedback in flows: https://docs.crewai.com/en/learn/human-feedback-in-flows
- CrewAI coding tools and `AGENTS.md`: https://docs.crewai.com/en/guides/coding-tools/agents-md
- OpenAI Agents SDK guide: https://developers.openai.com/api/docs/guides/agents
- Local research report: `C:\Users\4elut\Downloads\deep-research-report.md`
- Local Vibe/GameSpree architecture report: `C:\Users\4elut\Downloads\deep-research-report (1).md`
