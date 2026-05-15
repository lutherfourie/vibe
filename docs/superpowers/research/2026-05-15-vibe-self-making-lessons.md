# Vibe Self-Making Lessons

**Status:** Working lessons note.
**Date:** 2026-05-15
**Owner:** Luther

## What We Have Learned

1. Vibe should be the public name, with Vibe Spec as the formal technical name.
2. Vibecade is the company, not the language name.
3. Vibe is best framed as Agentic Infrastructure as Code: a declarative layer
   for vibe-coded systems.
4. The Go channel analogy is useful, but public Vibe terms should be lane,
   handoff, gate, provider route, write scope, and runtime.
5. Vibe should not replace LangGraph, OpenAI Agents SDK, CrewAI, Microsoft
   Agent Framework, LlamaIndex, MCP, or Temporal. It should coordinate them.
6. TypeScript/Langium remains the language and editor layer for now.
7. Go is a good runtime layer for local mechanics: binaries, process
   supervision, bounded concurrency, environment checks, and repo safety.
8. Direct Codex cloud dispatch should use supported surfaces: Codex web, IDE
   cloud delegation, or GitHub integration. Vibe should generate precise
   handoffs before it tries to automate anything more brittle.

## Fresh-Start Posture

Start somewhat afresh from principles, not from the latest spike shape.

The current Go code is useful as a sketch, but it is not yet the architecture.
Treat it as disposable scaffolding until Vibe proves which parts should become
runtime, SDK, generated code, or documentation.

### Keep

- Vibe is the project name and `.vibe` is the source format.
- Vibe is Vibecade's concrete tool for vibe-coded systems, not a generic claim
  over the whole practice of vibe coding.
- Vibe should declare agents, lanes, tools, memory, provider routes, validation
  gates, and human approvals.
- Vibe should coordinate existing AI frameworks where they are strongest.
- Vibe should be able to generate artifacts that help itself evolve.

### Demote to provisional

- The exact Go package layout.
- The `vibe-doctor`, `vibe-make`, and `vibe-coord` binary names.
- The lane-plan JSON shape.
- The split between TypeScript, Go, and future runtimes.
- The phrase "Vibe Spec" as a locked formal name.
- Any assumption that SD3's init pipeline is the next best implementation step.

### Reframe

The first real question is not "what Go binaries do we need?"

The first real question is:

> What is the smallest Vibe source that can describe Vibe's own next work
> without hard-coding today's guesses?

That source should be readable by a human, useful before full interpretation,
and compile later into Go, TypeScript, MCP, Codex, Claude, GitHub, or LangGraph
artifacts.

## Self-Making Bootstrap Shape

Vibe can begin making itself before full self-hosting by generating the
artifacts that let humans and agents work safely:

```text
Vibe knowledge
  -> Vibe Spec notes
  -> lane-plan IR
  -> Go tooling binaries
  -> generated handoffs and checks
  -> reviewed repo changes
  -> updated Vibe knowledge
```

This loop is enough to make Vibe useful while the parser, `vibe init`, and
provider adapters mature.

After the fresh-start reframe, the bootstrap loop becomes:

```text
human intent
  -> tiny .vibe source for Vibe itself
  -> generated lane plan / docs / prompts
  -> optional Go or TS tooling
  -> reviewed changes
  -> updated .vibe source
```

The `.vibe` source is the center. Go is a strong implementation tool, not the
center.

## Bootstrap Binaries

The Go spike starts with three small binaries:

| Binary | Job |
| --- | --- |
| `vibe-doctor` | Inspect local prerequisites such as git, node, pnpm, go, codex, and claude. |
| `vibe-make` | Generate a Vibe self-making lane plan from what the repo knows today. |
| `vibe-coord` | Validate the lane plan and emit handoff artifacts. |

The first bootstrapping loop is:

```powershell
vibe-doctor --json
vibe-make plan --repo C:\vibe --out .vibe-out\self-plan.json
vibe-coord emit --plan .vibe-out\self-plan.json --out .vibe-out\handoffs
```

Go is not installed in the current environment, so this loop is source-level
until the Go toolchain is available.

These binaries remain provisional until the tiny self-describing `.vibe` source
proves which tool boundaries are actually needed.

## Next Clean Slice

Create a small source file such as:

```text
examples/vibe-self.vibe
```

It should declare:

- Vibe's current identity.
- The active repo: `C:\vibe`.
- The fresh-start constraint: specs may change as learning happens.
- A few lanes: research, language, runtime spike, verification.
- One merge gate requiring human review.

Then make tooling orbit that file instead of letting tooling define the product.
