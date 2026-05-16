# @vibe/language

Vibe is a hybrid specification language for vibecoded ecosystems. This package
ships the SD1 + SD2 surface: parser, AST, validators, file-shape dispatcher,
LLM resolver, and provider adapters.

## Status

- **SD1 (Language layer):** 9 primitives (agent, route, fallback, persona,
  provider, memory, harness, plugin, trigger) plus the SD2 `corrected`
  declaration. 4 validators (duplicate-declarations, required-resolver-route,
  cross-reference-resolution, corrected-target).
- **SD2 (Dispatcher + Resolver):** file-shape dispatcher slices `.vibe` source
  into structured + prose regions. Resolver wraps a pluggable ProviderAdapter
  with content-addressed cache + Zod schema validation + variance metadata.
  Adjacent `corrected for "tag"` blocks override resolver outputs per-key.
- **Provider adapters:** OpenAI GPT-5.5 via Responses API (default for
  resolver), Cerebras via @ai-sdk/openai-compatible, and claude CLI via execa.
  codex / gemini shims follow in Phase 2.
- **Not yet:** vibe init, vibe sync, vibe build, full VS Code LSP integration
  (hover-based resolver preview lands in SD4).

## Build + test

```bash
pnpm --filter @vibe/language build
pnpm --filter @vibe/language test
```

## Usage

```ts
import {
  createOpenAIProvider,
  createProviderRegistry,
  runPipeline,
} from "@vibe/language";
import { z } from "zod";

const registry = createProviderRegistry();
registry.register(createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-5.5",
}));

const result = await runPipeline({
  source: await readFile("project.vibe", "utf8"),
  registry,
  defaultResolver: { provider: "openai.gpt_5_5", model: "gpt-5.5", temperature: 0.3 },
  proseSchema: z.object({ description: z.string() }),
});

console.log(result.shape, result.parseErrors, result.mergedRegions);
```

## Grammar quick reference

See `examples/` for canonical shapes. Key additions in SD2:

- `corrected for "tag" { ... }` — overrides a resolver output by tag

## Examples

Every file in `examples/` parses + validates + (for markdown sources) flows
through `runPipeline` cleanly. The integration test enforces this.
