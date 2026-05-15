# Vibe Agentic IaC and Framework Map

**Status:** Working research note.
**Date:** 2026-05-15
**Owner:** Luther

## Thesis

Vibe is Vibecade's specification and runtime model for coordinating vibe-coded systems.

Short form:

> Vibe is IaC for vibe coding.

More precise form:

> Vibe is Agentic Infrastructure as Code: a declarative layer for agents, tools,
> memory, repo lanes, provider routes, validation gates, human approvals, and
> generated provider artifacts.

The repo should not be the coordination mechanism. The repo should be the
artifact store. Coordination belongs in Vibe-declared lanes, typed handoffs,
worktree isolation, and merge gates.

## Naming

- Company: Vibecade
- Public product/language: Vibe
- Formal spec: Vibe Spec
- File extension: `.vibe`
- Runtime: Vibe Runtime
- CLI: `vibe`
- Go package family: `vibe-go` or the repo-local `go/` runtime module

Avoid public names that collide with established terms:

- Do not use `vlang` publicly. The V language already owns that association.
- Do not brand core features as CSP, channels, goroutines, actors, or contexts.
  Those are useful implementation analogies, not product terms.
- Use "lane", "handoff", "gate", "provider route", and "write scope" as the
  public coordination vocabulary.

## How Existing AI Frameworks Can Work Together

Vibe should not try to replace every agent framework. Vibe should own the
project-level specification and delegate execution to the right backend.

```text
Vibe Spec
  declares agents, lanes, channels, ownership, providers, tools, checks

Vibe Runtime / SDK
  supervises local worktrees, subprocesses, prompts, handoffs, merge gates

Framework adapters
  LangGraph, OpenAI Agents SDK, CrewAI, Microsoft Agent Framework, LlamaIndex

Tool and data plane
  MCP servers, GitHub, filesystem, build systems, Unity, repo scanners

Execution targets
  Codex local, Codex cloud handoff, Claude Code, API agents, custom workers
```

### Roles

| System | Best ownership in Vibe |
| --- | --- |
| LangGraph | Durable stateful workflows, checkpointed human-in-the-loop runs, resumable graph execution. |
| OpenAI Agents SDK | OpenAI-native agent runs, tools, handoffs, guardrails, tracing. |
| CrewAI | Role-based crews and higher-level business-style multi-agent flows. |
| Microsoft Agent Framework | Enterprise-oriented typed orchestration, middleware, telemetry, and workflow integration. |
| LlamaIndex | Data-heavy and retrieval-heavy agent workflows over documents and indexes. |
| MCP | Standard tool/resource/prompt exposure between agents and external systems. |
| Temporal | Production-grade durable execution when Vibe workflows must survive process or machine failure. |
| Go runtime | Local orchestration, bounded concurrency, subprocess supervision, file ownership, worktree safety. |

Vibe's job is to answer:

- Which lane owns this work?
- Which files may it read and write?
- Which provider/runtime should execute it?
- What typed handoff does it emit?
- What validation gates must pass before merge?
- Where does the human approve, edit, or stop the run?

The backend framework's job is to execute the lane.

## Go Runtime Fit

Go is a good near-term runtime for the mechanical coordination layer because it
has strong standard-library support for:

- `context.Context` cancellation and deadlines
- channel-shaped fan-out and fan-in
- subprocess supervision
- filesystem walking and path checks
- JSON command-line tools
- long-running local daemons
- small static binaries once Go is installed in the environment

This does not make Vibe a Go language. The right model is:

```text
.vibe source
  -> Vibe IR
  -> Go runtime consumes the IR
  -> lanes emit prompts, run local agents, validate scopes, fan in results
```

## First Practical Slice

The first useful Go slice should be intentionally narrow:

1. Read a simple JSON lane plan.
2. Validate that write-capable lanes do not have overlapping write scopes.
3. Emit Codex cloud handoff prompts for lanes with `mode: "codex.web"`.
4. Emit local checklists for lanes with `mode: "local"`.
5. Leave actual Codex cloud dispatch to supported surfaces: Codex web, the IDE
   cloud delegation flow, or GitHub `@codex` integration.

That gives Vibe immediate value without pretending to own unstable provider UI
automation.

## Source Links

- LangGraph durable execution: https://docs.langchain.com/oss/python/langgraph/durable-execution
- OpenAI Codex cloud: https://platform.openai.com/docs/codex/overview
- OpenAI Agents SDK: https://platform.openai.com/docs/guides/agents-sdk/
- CrewAI introduction: https://docs.crewai.com/introduction
- Microsoft Agent Framework overview: https://learn.microsoft.com/en-us/agent-framework/user-guide/overview
- LlamaIndex multi-agent workflows: https://docs.llamaindex.ai/en/stable/understanding/agent/multi_agent/
- MCP architecture overview: https://modelcontextprotocol.io/docs/concepts
- Temporal documentation: https://docs.temporal.io/
