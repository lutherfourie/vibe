# Vibe v0 SD2 — File-shape dispatcher + LLM resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the file-shape dispatcher (slices `.vibe` sources into structured + prose regions), the LLM resolver (turns prose into typed structured data via Cerebras/GLM by default, swappable per route), provider adapters (Cerebras API mode + CLI shims for claude/codex/gemini via execa), and adjacent `corrected { ... }` user-override blocks. SD2 is the "make prose into data" layer above the SD1 language.

**Architecture:** Five new modules under `packages/language/src/`: `dispatcher/` (file-shape detection + region slicing, plain TS sitting above Langium), `resolver/` (prose → typed output, content-addressed cache, variance metadata), `providers/` (api + cli adapters keyed by name + mode), one small grammar extension to add a `Corrected` declaration, and a top-level `pipeline/` module that orchestrates dispatch → parse + resolve → corrections. Existing SD1 grammar / validator / examples are not rewritten — they sit underneath.

**Tech Stack:** TypeScript 5.6+, Langium 4.2.4 (SD1 parser, reused unchanged for structured regions), Zod 4 (runtime schemas for resolver output validation), Vercel AI SDK 6 + `@ai-sdk/openai-compatible` (Cerebras goes through the OpenAI-compatible endpoint), `execa` 9.x (CLI subprocess), `unified` + `remark-parse` (markdown region slicing), `crypto.subtle` / Node's built-in `crypto` (content hashing for cache keys), Vitest 2.x (test runner, singleton-services pattern from SD1).

**Reference plan:** SD1 lives at `c:/Hive/vibe/docs/superpowers/plans/2026-05-13-vibe-v0-sd1-language.md`. SD2 follows the same TDD bite-size shape — one assertion at a time, commit after every passing test family. Read it before starting if you have not implemented SD1.

**Pre-conditions verified before SD2 starts:** `pnpm --filter @vibe/language test` reports 160/160 across 19 files on `main`. `pnpm --filter @vibe/language build` exits 0. The `Name` rule in `packages/language/src/vibe.langium` already contains all SD1 keywords; SD2 will append `'corrected'` in Task 8.

**Definition of done:**
- `pnpm -r build` exits 0 across both packages
- 220+ tests passing (160 SD1 + ~60 new)
- The 9 SD1 example files still parse + validate clean (no regression)
- One new example file `examples/10-resolver-flow.vibe` demonstrates a prose region → resolver call → corrected override, with a passing integration test
- Cerebras provider can be wired with an `OPENAI_COMPATIBLE_BASE_URL=<cerebras-endpoint>` + `CEREBRAS_API_KEY` and resolve a simple prose region end-to-end against a recorded fixture (no live LLM call in CI)
- CLI provider shim for `claude` can be wired with a `--mock-binary` flag in tests so the subprocess protocol is exercised without spawning a real CLI

---

## File Structure

### New files (created by SD2)

```
packages/language/
├── src/
│   ├── dispatcher/
│   │   ├── index.ts                  # public API: dispatchSource(text): RegionStream
│   │   ├── types.ts                  # Region, RegionKind, ProseRegion, StructuredRegion, SourceShape
│   │   ├── detect-shape.ts           # detectShape(text): SourceShape
│   │   ├── slice-pure.ts             # slicePureStructured(text): Region[]
│   │   ├── slice-markdown.ts         # sliceMarkdown(text): Region[]
│   │   └── slice-conversation.ts     # sliceConversation(text): Region[]
│   ├── resolver/
│   │   ├── index.ts                  # public API: resolveProse(region, ctx): Promise<ResolverResult>
│   │   ├── types.ts                  # ProseRegion (re-export), ResolverContext, ResolverResult, Variance
│   │   ├── cache.ts                  # ContentAddressedCache (key = sha256(content + model + temp))
│   │   ├── prompts.ts                # buildSystemPrompt / buildUserPrompt — pure functions
│   │   ├── corrections.ts            # mergeCorrected(resolved, corrected): MergedResult
│   │   └── variance.ts               # makeVariance(provider, model, temperature, at): Variance
│   ├── providers/
│   │   ├── index.ts                  # ProviderRegistry + lookupProvider
│   │   ├── types.ts                  # ProviderAdapter, ChatMessage, ChatRequest, ChatResponse
│   │   ├── mock.ts                   # MockProvider for tests (deterministic, no network)
│   │   ├── api/
│   │   │   ├── cerebras.ts           # Cerebras adapter via @ai-sdk/openai-compatible
│   │   │   └── ai-sdk-bridge.ts      # thin wrapper around generateObject / generateText
│   │   └── cli/
│   │       ├── base.ts               # CliProviderBase (execa-driven, lifecycle policy)
│   │       └── claude.ts             # claude CLI shim (stdio JSON-line)
│   └── pipeline/
│       └── run.ts                    # runPipeline(text, ctx): orchestrates dispatch → parse + resolve → merge
├── test/
│   ├── dispatcher/
│   │   ├── detect-shape.test.ts
│   │   ├── slice-pure.test.ts
│   │   ├── slice-markdown.test.ts
│   │   ├── slice-conversation.test.ts
│   │   └── dispatch.test.ts
│   ├── resolver/
│   │   ├── cache.test.ts
│   │   ├── prompts.test.ts
│   │   ├── corrections.test.ts
│   │   ├── variance.test.ts
│   │   └── resolve.test.ts
│   ├── providers/
│   │   ├── mock.test.ts
│   │   ├── registry.test.ts
│   │   ├── api/cerebras.test.ts
│   │   └── cli/claude.test.ts
│   ├── pipeline/
│   │   └── pipeline.test.ts
│   └── fixtures/
│       ├── shapes/
│       │   ├── pure.vibe
│       │   ├── markdown.vibe
│       │   └── conversation.vibe
│       └── recordings/
│           └── cerebras-hello.json   # recorded response for offline CI
└── examples/
    └── 10-resolver-flow.vibe         # demonstrates the full SD2 surface
```

### Modified files

- `packages/language/src/vibe.langium` — append `Corrected` declaration, append `'corrected'` to `Name` alias
- `packages/language/src/vibe-validator.ts` — register a new validator check for `Corrected` (must reference a sibling resolved region by tag)
- `packages/language/src/index.ts` — re-export dispatcher/resolver/providers public APIs
- `packages/language/package.json` — add `zod`, `@ai-sdk/openai-compatible`, `ai`, `execa`, `unified`, `remark-parse` dependencies
- `packages/language/README.md` — document the SD2 surface

### Files left untouched

- `packages/language/src/vibe-module.ts` (no new DI overrides at v0)
- `packages/vscode-extension/*` (LSP hover-preview integration is deferred; SD4 will cover it)
- The 9 SD1 example files (`examples/01-provider.vibe` through `09-project.vibe`)
- The 3 SD1 validator implementations (duplicate-declarations, required-resolver-route, cross-references)

---

## Subagent-Driven-Development Protocol

For each task, the orchestrator (you, or a subagent dispatcher) should:

1. Dispatch an **implementer** subagent with the task brief and a hard "STOP and report" rule if the spec cannot be met.
2. After implementer reports done, dispatch **two reviewers in parallel** — one for spec compliance, one for code quality.
3. If either review returns `FAIL` or HIGH-confidence notes, address inline and re-run reviewers if needed.
4. Mark the task done in the orchestrator's todo list. Move to next task.

Each implementer prompt should include:
- The exact Task N section of this plan
- The current branch (`feat/sd2-resolver`)
- A mandatory checklist mirroring SD1's:
  - Test depth: every positive test asserts both shape (`$type` / typeof / instanceof) and content
  - Negative tests: at least 2 per task using `expectXyzFailure` or equivalent helpers
  - Generated files (`src/generated/`, `vibe.tmLanguage.json`) stay gitignored
  - No regression on the prior task count
- The signed commit footer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

---

## Branch Strategy

Create the feature branch on `main` (which already contains the SD1 merge):

```bash
cd c:/Hive/vibe
git checkout main
git pull --ff-only origin main
git checkout -b feat/sd2-resolver
```

Or use a worktree at `c:/Hive/vibe-sd2`:

```bash
cd c:/Hive/vibe
git worktree add c:/Hive/vibe-sd2 -b feat/sd2-resolver
```

All work happens on `feat/sd2-resolver`. Pushes are user-authorized.

---

## Phase A — Dispatcher (Tasks 1-6)

The dispatcher is a plain TS layer above Langium that slices a `.vibe` source into a `RegionStream` — alternating structured and prose regions. The parser only sees structured regions; the resolver only sees prose. This keeps the Langium grammar context-free and the resolver focused on prose.

### Task 1: Test infrastructure + Region types

**Files:**
- Create: `packages/language/src/dispatcher/types.ts`
- Create: `packages/language/test/fixtures/shapes/pure.vibe`
- Create: `packages/language/test/fixtures/shapes/markdown.vibe`
- Create: `packages/language/test/fixtures/shapes/conversation.vibe`

- [ ] **Step 1: Write Region types**

`packages/language/src/dispatcher/types.ts`:

```ts
export type SourceShape =
  | "pure-structured"
  | "markdown"
  | "conversation";

export type RegionKind = "structured" | "prose";

export interface BaseRegion {
  kind: RegionKind;
  /** Byte offset of region start in the original source. */
  start: number;
  /** Byte offset of region end (exclusive) in the original source. */
  end: number;
  /** Source text for the region, verbatim (no trim). */
  text: string;
}

export interface StructuredRegion extends BaseRegion {
  kind: "structured";
}

export interface ProseRegion extends BaseRegion {
  kind: "prose";
  /** Optional tag for prose regions in conversation files: "user" | "assistant" | "system". */
  role?: "user" | "assistant" | "system";
  /** Optional resolver tag from a fenced code-block info string (e.g. ```vibe-prose#tag123). */
  tag?: string;
}

export type Region = StructuredRegion | ProseRegion;

export interface RegionStream {
  shape: SourceShape;
  regions: Region[];
}
```

- [ ] **Step 2: Add three fixture files**

`packages/language/test/fixtures/shapes/pure.vibe`:

```vibe
provider cerebras.glm_4_7 { mode = api }
route resolver -> cerebras.glm_4_7
persona izsha { description = "coordinator, dry" }
```

`packages/language/test/fixtures/shapes/markdown.vibe`:

````markdown
# Izsha Sketch

Coordinator agent that owns the asset pipeline.

```vibe
provider cerebras.glm_4_7 { mode = api }
route resolver -> cerebras.glm_4_7
persona izsha { description = "coordinator, dry" }
```

She should sound terse and prefer concrete plans over speculation.
````

`packages/language/test/fixtures/shapes/conversation.vibe`:

```text
### user
We need an agent that drains the codex backlog. Call her Izsha.

### assistant
Here is a starting sketch.

```vibe
provider cerebras.glm_4_7 { mode = api }
persona izsha { description = "coordinator, dry" }
```

### user
She should also own the deploy pipeline.
```

- [ ] **Step 3: Commit**

```bash
git add packages/language/src/dispatcher/types.ts \
        packages/language/test/fixtures/shapes/pure.vibe \
        packages/language/test/fixtures/shapes/markdown.vibe \
        packages/language/test/fixtures/shapes/conversation.vibe
git commit -m "$(cat <<'EOF'
chore(dispatcher): scaffold Region types + 3 source-shape fixtures

Lays the typed surface SD2 builds against: Region (structured | prose),
RegionStream, SourceShape. Three sample sources cover the canonical
shapes - pure structured, markdown-with-vibe-fences, role-tagged
conversation transcript.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2: detectShape — sniffs source shape from text

**Files:**
- Create: `packages/language/src/dispatcher/detect-shape.ts`
- Create: `packages/language/test/dispatcher/detect-shape.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/language/test/dispatcher/detect-shape.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectShape } from "../../src/dispatcher/detect-shape.js";

const FIXTURE_DIR = fileURLToPath(new URL("../fixtures/shapes/", import.meta.url));

async function fixture(name: string): Promise<string> {
  return readFile(`${FIXTURE_DIR}${name}`, "utf8");
}

describe("detectShape", () => {
  it("identifies pure-structured source", async () => {
    const text = await fixture("pure.vibe");
    expect(detectShape(text)).toBe("pure-structured");
  });

  it("identifies markdown source by leading heading + fenced vibe block", async () => {
    const text = await fixture("markdown.vibe");
    expect(detectShape(text)).toBe("markdown");
  });

  it("identifies conversation source by role tag at line start", async () => {
    const text = await fixture("conversation.vibe");
    expect(detectShape(text)).toBe("conversation");
  });

  it("falls back to pure-structured for empty input", () => {
    expect(detectShape("")).toBe("pure-structured");
  });

  it("falls back to pure-structured when no leading prose marker is present", () => {
    expect(detectShape("// a comment\nprovider c.g { mode = api }")).toBe("pure-structured");
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
pnpm --filter @vibe/language test test/dispatcher/detect-shape.test.ts
```

Expected: `Error: Cannot find module ... detect-shape.js`.

- [ ] **Step 3: Write the implementation**

`packages/language/src/dispatcher/detect-shape.ts`:

```ts
import type { SourceShape } from "./types.js";

const ROLE_TAG = /^###\s+(user|assistant|system)\b/m;
const MD_HEADING = /^#\s+\S/m;
const FENCED_VIBE = /^```vibe(\s|$)/m;

export function detectShape(source: string): SourceShape {
  // Conversation wins: a role tag is unambiguous.
  if (ROLE_TAG.test(source)) return "conversation";
  // Markdown wins next: leading H1 heading + at least one fenced vibe block.
  if (MD_HEADING.test(source) && FENCED_VIBE.test(source)) return "markdown";
  // Default: parse it as pure structured.
  return "pure-structured";
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm --filter @vibe/language test test/dispatcher/detect-shape.test.ts
```

Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/language/src/dispatcher/detect-shape.ts \
        packages/language/test/dispatcher/detect-shape.test.ts
git commit -m "$(cat <<'EOF'
feat(dispatcher): detectShape distinguishes pure / markdown / conversation

Three deterministic regexes, conservative ordering: role tags win, then
H1 + fenced-vibe markdown, fallback pure. The conservative default
means anything the dispatcher can't classify gets parsed as structured
- which surfaces as a parse error rather than silently routing prose
to the wrong handler.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 3: slicePureStructured — single-region passthrough

**Files:**
- Create: `packages/language/src/dispatcher/slice-pure.ts`
- Create: `packages/language/test/dispatcher/slice-pure.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/language/test/dispatcher/slice-pure.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { slicePureStructured } from "../../src/dispatcher/slice-pure.js";

describe("slicePureStructured", () => {
  it("emits one structured region covering the whole source", () => {
    const text = "provider c.g { mode = api }\n";
    const regions = slicePureStructured(text);
    expect(regions).toHaveLength(1);
    expect(regions[0].kind).toBe("structured");
    expect(regions[0].start).toBe(0);
    expect(regions[0].end).toBe(text.length);
    expect(regions[0].text).toBe(text);
  });

  it("emits zero regions for empty input", () => {
    expect(slicePureStructured("")).toEqual([]);
  });

  it("preserves trailing newlines verbatim", () => {
    const text = "agent foo {}\n\n";
    const [region] = slicePureStructured(text);
    expect(region.text).toBe(text);
    expect(region.end).toBe(text.length);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
pnpm --filter @vibe/language test test/dispatcher/slice-pure.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Write the implementation**

`packages/language/src/dispatcher/slice-pure.ts`:

```ts
import type { Region } from "./types.js";

export function slicePureStructured(source: string): Region[] {
  if (source.length === 0) return [];
  return [
    {
      kind: "structured",
      start: 0,
      end: source.length,
      text: source,
    },
  ];
}
```

- [ ] **Step 4: Run tests — expect pass**

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/language/src/dispatcher/slice-pure.ts \
        packages/language/test/dispatcher/slice-pure.test.ts
git commit -m "$(cat <<'EOF'
feat(dispatcher): slicePureStructured passes the whole source through

Trivial slicer for the pure-structured shape - one region covering
[0, text.length). Exists so the orchestrator never branches on shape;
it always asks a slicer for regions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4: sliceMarkdown — extract fenced vibe blocks + between-block prose

**Files:**
- Create: `packages/language/src/dispatcher/slice-markdown.ts`
- Create: `packages/language/test/dispatcher/slice-markdown.test.ts`
- Modify: `packages/language/package.json` (add `unified`, `remark-parse`)

- [ ] **Step 1: Add markdown dependencies**

```bash
cd c:/Hive/vibe
pnpm --filter @vibe/language add unified@^11 remark-parse@^11
```

Verify `package.json` now lists both. Commit the dependency change inline with Task 4's main commit — do NOT commit `package.json` separately.

- [ ] **Step 2: Write the failing tests**

`packages/language/test/dispatcher/slice-markdown.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sliceMarkdown } from "../../src/dispatcher/slice-markdown.js";

const FIXTURE_DIR = fileURLToPath(new URL("../fixtures/shapes/", import.meta.url));

async function fixture(name: string): Promise<string> {
  return readFile(`${FIXTURE_DIR}${name}`, "utf8");
}

describe("sliceMarkdown", () => {
  it("returns prose, structured, prose for the markdown fixture", async () => {
    const text = await fixture("markdown.vibe");
    const regions = sliceMarkdown(text);

    expect(regions).toHaveLength(3);
    expect(regions[0].kind).toBe("prose");
    expect(regions[0].text).toContain("Coordinator agent that owns");
    expect(regions[1].kind).toBe("structured");
    expect(regions[1].text).toContain("persona izsha");
    expect(regions[1].text).not.toContain("```");
    expect(regions[2].kind).toBe("prose");
    expect(regions[2].text).toContain("terse");
  });

  it("offsets are correct and cover the whole source", async () => {
    const text = await fixture("markdown.vibe");
    const regions = sliceMarkdown(text);
    expect(regions[0].start).toBe(0);
    expect(regions.at(-1)!.end).toBe(text.length);
    for (let i = 1; i < regions.length; i++) {
      expect(regions[i].start).toBeGreaterThanOrEqual(regions[i - 1].end);
    }
  });

  it("strips the fence markers from structured region text", async () => {
    const text = "# Title\n\nprose\n\n```vibe\nagent foo {}\n```\n\nmore prose\n";
    const regions = sliceMarkdown(text);
    const structured = regions.find((r) => r.kind === "structured");
    expect(structured?.text.trim()).toBe("agent foo {}");
  });

  it("ignores non-vibe fenced blocks (e.g. js, ts) — treats them as prose", () => {
    const text = "# T\n\n```ts\nconst x = 1\n```\n";
    const regions = sliceMarkdown(text);
    // One prose region covering everything (no structured emission).
    expect(regions.every((r) => r.kind === "prose")).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests — expect failure**

Module-not-found.

- [ ] **Step 4: Write the implementation**

`packages/language/src/dispatcher/slice-markdown.ts`:

```ts
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Code, Root } from "mdast";
import type { Region } from "./types.js";

/**
 * Recognized fence langs:
 *   ```vibe              → structured region (parsed by Langium)
 *   ```vibe-prose        → prose region (sent to resolver, no tag)
 *   ```vibe-prose#tag    → prose region with explicit tag for corrected-block matching
 * All other lang values are treated as prose (free markdown text).
 */
interface VibeBlock {
  start: number;
  end: number;
  inner: { start: number; end: number; text: string };
  kind: "structured" | "prose";
  tag?: string;
}

function classifyLang(lang: string | null | undefined): { kind: "structured" | "prose"; tag?: string } | null {
  if (!lang) return null;
  if (lang === "vibe") return { kind: "structured" };
  if (lang === "vibe-prose") return { kind: "prose" };
  if (lang.startsWith("vibe-prose#")) {
    return { kind: "prose", tag: lang.slice("vibe-prose#".length) };
  }
  return null;
}

export function sliceMarkdown(source: string): Region[] {
  const tree = unified().use(remarkParse).parse(source) as Root;

  const vibeBlocks: VibeBlock[] = [];
  for (const node of tree.children) {
    if (node.type !== "code") continue;
    const code = node as Code;
    const classification = classifyLang(code.lang);
    if (!classification) continue;
    const start = code.position?.start.offset;
    const end = code.position?.end.offset;
    if (start === undefined || end === undefined) continue;

    // mdast gives us positions for the whole block including the fence lines,
    // but `code.value` contains only the inner text. Synthesize inner offsets
    // from the value's length.
    const innerStartLine = source.indexOf("\n", start) + 1;
    const innerEnd = innerStartLine + code.value.length;
    vibeBlocks.push({
      start,
      end,
      inner: { start: innerStartLine, end: innerEnd, text: code.value },
      kind: classification.kind,
      tag: classification.tag,
    });
  }

  const regions: Region[] = [];
  let cursor = 0;
  for (const block of vibeBlocks) {
    if (block.start > cursor) {
      regions.push({
        kind: "prose",
        start: cursor,
        end: block.start,
        text: source.slice(cursor, block.start),
      });
    }
    if (block.kind === "structured") {
      regions.push({
        kind: "structured",
        start: block.inner.start,
        end: block.inner.end,
        text: block.inner.text,
      });
    } else {
      regions.push({
        kind: "prose",
        start: block.inner.start,
        end: block.inner.end,
        text: block.inner.text,
        tag: block.tag,
      });
    }
    cursor = block.end;
  }
  if (cursor < source.length) {
    regions.push({
      kind: "prose",
      start: cursor,
      end: source.length,
      text: source.slice(cursor),
    });
  }
  return regions;
}
```

Extend the test file with one more case covering tagged prose fences:

```ts
  it("extracts ```vibe-prose#tag fences as prose regions with tag", () => {
    const text = "# T\n\n```vibe-prose#sketch1\nMake an agent.\n```\n\n```vibe\nagent foo {}\n```\n";
    const regions = sliceMarkdown(text);
    const taggedProse = regions.find((r) => r.kind === "prose" && r.tag === "sketch1");
    expect(taggedProse).toBeDefined();
    expect(taggedProse?.text.trim()).toBe("Make an agent.");
    expect(regions.find((r) => r.kind === "structured")?.text.trim()).toBe("agent foo {}");
  });
```

- [ ] **Step 5: Run tests — expect pass**

Expected: `4 passed`. If the offset arithmetic fails on a fixture you wrote yourself, trust the spec — the structured-region text MUST equal the inner code (no fence markers, no leading/trailing newlines beyond what mdast preserves).

- [ ] **Step 6: Commit**

```bash
git add packages/language/src/dispatcher/slice-markdown.ts \
        packages/language/test/dispatcher/slice-markdown.test.ts \
        packages/language/package.json \
        pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(dispatcher): sliceMarkdown extracts ```vibe blocks + between prose

Uses unified + remark-parse to walk the markdown AST. Vibe-fenced
code blocks become structured regions (fence markers stripped); the
text between them becomes prose regions. Non-vibe fences (ts, py)
are treated as prose so the resolver decides what to do with them.

Adds unified@11 + remark-parse@11 to @vibe/language deps.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 5: sliceConversation — role-tagged turn extraction

**Files:**
- Create: `packages/language/src/dispatcher/slice-conversation.ts`
- Create: `packages/language/test/dispatcher/slice-conversation.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/language/test/dispatcher/slice-conversation.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sliceConversation } from "../../src/dispatcher/slice-conversation.js";

const FIXTURE_DIR = fileURLToPath(new URL("../fixtures/shapes/", import.meta.url));

async function fixture(name: string): Promise<string> {
  return readFile(`${FIXTURE_DIR}${name}`, "utf8");
}

describe("sliceConversation", () => {
  it("emits one region per turn, role attached", async () => {
    const text = await fixture("conversation.vibe");
    const regions = sliceConversation(text);

    const proseRegions = regions.filter((r) => r.kind === "prose");
    const structuredRegions = regions.filter((r) => r.kind === "structured");

    // 3 turns: user / assistant (with embedded vibe block) / user.
    expect(proseRegions.length).toBeGreaterThanOrEqual(3);
    expect(structuredRegions).toHaveLength(1);
    expect(structuredRegions[0].text).toContain("persona izsha");
  });

  it("attaches role metadata to each prose region", async () => {
    const text = await fixture("conversation.vibe");
    const regions = sliceConversation(text);
    const proseRegions = regions.filter((r) => r.kind === "prose");
    const roles = proseRegions.map((r) => r.kind === "prose" ? r.role : null);
    expect(roles).toContain("user");
    expect(roles).toContain("assistant");
  });

  it("rejects sources missing a role tag", () => {
    // sliceConversation should only be called when detectShape returns
    // "conversation". As a defensive guard, calling it on a non-conversation
    // source throws rather than silently returning the whole source as prose.
    expect(() => sliceConversation("plain text with no role tags")).toThrow(
      /role tag/i,
    );
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Module-not-found.

- [ ] **Step 3: Write the implementation**

`packages/language/src/dispatcher/slice-conversation.ts`:

```ts
import type { ProseRegion, Region } from "./types.js";

const ROLE_RE = /^###\s+(user|assistant|system)\b[^\n]*$/gm;
const FENCED_VIBE_RE = /```vibe\n([\s\S]*?)```/g;

type Role = "user" | "assistant" | "system";

interface Turn {
  role: Role;
  bodyStart: number;
  bodyEnd: number;
  bodyText: string;
}

function findTurns(source: string): Turn[] {
  const matches = [...source.matchAll(ROLE_RE)];
  if (matches.length === 0) {
    throw new Error("sliceConversation requires at least one `### user|assistant|system` role tag");
  }
  const turns: Turn[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const role = m[1] as Role;
    const tagStart = m.index!;
    const bodyStart = tagStart + m[0].length + 1; // +1 for the newline after the tag
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index! : source.length;
    turns.push({
      role,
      bodyStart,
      bodyEnd,
      bodyText: source.slice(bodyStart, bodyEnd),
    });
  }
  return turns;
}

function splitTurnByFences(turn: Turn): Region[] {
  const regions: Region[] = [];
  let cursor = turn.bodyStart;
  for (const m of turn.bodyText.matchAll(FENCED_VIBE_RE)) {
    const fenceStartInTurn = m.index!;
    const fenceEndInTurn = fenceStartInTurn + m[0].length;
    const fenceStartGlobal = turn.bodyStart + fenceStartInTurn;
    const fenceEndGlobal = turn.bodyStart + fenceEndInTurn;

    if (fenceStartGlobal > cursor) {
      regions.push({
        kind: "prose",
        role: turn.role,
        start: cursor,
        end: fenceStartGlobal,
        text: turn.bodyText.slice(cursor - turn.bodyStart, fenceStartGlobal - turn.bodyStart),
      } satisfies ProseRegion);
    }
    regions.push({
      kind: "structured",
      start: fenceStartGlobal,
      end: fenceEndGlobal,
      text: m[1], // inner content between ```vibe\n and ```
    });
    cursor = fenceEndGlobal;
  }
  if (cursor < turn.bodyEnd) {
    regions.push({
      kind: "prose",
      role: turn.role,
      start: cursor,
      end: turn.bodyEnd,
      text: turn.bodyText.slice(cursor - turn.bodyStart),
    } satisfies ProseRegion);
  }
  return regions;
}

export function sliceConversation(source: string): Region[] {
  const turns = findTurns(source);
  return turns.flatMap(splitTurnByFences);
}
```

- [ ] **Step 4: Run tests — expect pass**

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/language/src/dispatcher/slice-conversation.ts \
        packages/language/test/dispatcher/slice-conversation.test.ts
git commit -m "$(cat <<'EOF'
feat(dispatcher): sliceConversation emits role-tagged prose + fenced vibe

Walks ### user / assistant / system headers, splits each turn body
into prose (with role metadata) and structured (the inner of any
```vibe fence). Throws on sources with no role tag so the dispatcher
guarantees only conversation-shaped input reaches this slicer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 6: dispatchSource — orchestrator + end-to-end test

**Files:**
- Create: `packages/language/src/dispatcher/index.ts`
- Create: `packages/language/test/dispatcher/dispatch.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/language/test/dispatcher/dispatch.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dispatchSource } from "../../src/dispatcher/index.js";

const FIXTURE_DIR = fileURLToPath(new URL("../fixtures/shapes/", import.meta.url));

async function fixture(name: string): Promise<string> {
  return readFile(`${FIXTURE_DIR}${name}`, "utf8");
}

describe("dispatchSource", () => {
  it("classifies + slices pure-structured source", async () => {
    const text = await fixture("pure.vibe");
    const stream = dispatchSource(text);
    expect(stream.shape).toBe("pure-structured");
    expect(stream.regions).toHaveLength(1);
    expect(stream.regions[0].kind).toBe("structured");
  });

  it("classifies + slices markdown source", async () => {
    const text = await fixture("markdown.vibe");
    const stream = dispatchSource(text);
    expect(stream.shape).toBe("markdown");
    const kinds = stream.regions.map((r) => r.kind);
    expect(kinds).toContain("structured");
    expect(kinds).toContain("prose");
  });

  it("classifies + slices conversation source", async () => {
    const text = await fixture("conversation.vibe");
    const stream = dispatchSource(text);
    expect(stream.shape).toBe("conversation");
    const proseRoles = stream.regions
      .filter((r) => r.kind === "prose")
      .map((r) => r.kind === "prose" ? r.role : null);
    expect(proseRoles).toContain("user");
    expect(proseRoles).toContain("assistant");
  });

  it("emits zero regions for empty input", () => {
    const stream = dispatchSource("");
    expect(stream.shape).toBe("pure-structured");
    expect(stream.regions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Module-not-found.

- [ ] **Step 3: Write the orchestrator**

`packages/language/src/dispatcher/index.ts`:

```ts
import { detectShape } from "./detect-shape.js";
import { slicePureStructured } from "./slice-pure.js";
import { sliceMarkdown } from "./slice-markdown.js";
import { sliceConversation } from "./slice-conversation.js";
import type { RegionStream } from "./types.js";

export type { Region, RegionKind, RegionStream, ProseRegion, StructuredRegion, SourceShape } from "./types.js";
export { detectShape } from "./detect-shape.js";

export function dispatchSource(source: string): RegionStream {
  const shape = detectShape(source);
  switch (shape) {
    case "pure-structured":
      return { shape, regions: slicePureStructured(source) };
    case "markdown":
      return { shape, regions: sliceMarkdown(source) };
    case "conversation":
      return { shape, regions: sliceConversation(source) };
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

Expected: `4 passed`. Re-run the whole dispatcher suite (`pnpm --filter @vibe/language test test/dispatcher/`) — expect 16+ passing.

- [ ] **Step 5: Commit**

```bash
git add packages/language/src/dispatcher/index.ts \
        packages/language/test/dispatcher/dispatch.test.ts
git commit -m "$(cat <<'EOF'
feat(dispatcher): dispatchSource ties shape detection + slicing together

Single public entry point. detectShape decides the shape; the matching
slicer produces the region stream. Re-exports Region types so consumers
import only from this module.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase B — Grammar extension for `corrected` blocks (Tasks 7-8)

The resolver produces typed output for prose regions, tagged with provenance. Users can override resolver output with an adjacent `corrected { ... }` block. The block needs to be parseable by Langium so the validator and downstream tools see it as a first-class declaration.

### Task 7: Add `Corrected` declaration to grammar

**Files:**
- Modify: `packages/language/src/vibe.langium`
- Create: `packages/language/test/primitives/corrected.test.ts`
- Modify: `packages/language/test/ast-helpers.ts` (add `firstCorrected`)

- [ ] **Step 1: Write the failing tests**

`packages/language/test/primitives/corrected.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isReference, isStringLiteral } from "../../src/generated/ast.js";
import { firstCorrected } from "../ast-helpers.js";
import { expectParseFailure, expectParses } from "../parse-helper.js";

describe("corrected primitive", () => {
  it("parses a corrected block referencing a tag", async () => {
    const project = await expectParses(`
      corrected for "resolver#tag123" {
        description = "human override"
        at = "2026-05-14T03:00:00Z"
        by = "luther"
      }
    `);
    const corrected = firstCorrected(project);
    expect(corrected.$type).toBe("Corrected");
    expect(corrected.target).toBe("resolver#tag123");
    expect(corrected.fields).toHaveLength(3);
    const descField = corrected.fields[0];
    expect(descField.name).toBe("description");
    expect(isStringLiteral(descField.value)).toBe(true);
    if (isStringLiteral(descField.value)) {
      expect(descField.value.value).toBe("human override");
    }
  });

  it("rejects a corrected block missing the `for` clause", async () => {
    const messages = await expectParseFailure(`
      corrected { description = "x" }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects a corrected block missing the body", async () => {
    const messages = await expectParseFailure(`
      corrected for "resolver#x"
    `);
    expect(messages.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Add `firstCorrected` helper**

Modify `packages/language/test/ast-helpers.ts` — add imports for `Corrected` + `isCorrected`, add the helper following the existing `first<T>` pattern.

- [ ] **Step 3: Run tests — expect failure**

`Cannot find name 'Corrected' on generated AST.`

- [ ] **Step 4: Extend the grammar**

In `packages/language/src/vibe.langium`:

```text
Declaration:
    Agent | Route | Fallback | Persona | Provider | Memory | Harness | Plugin | Trigger | Corrected;

Corrected:
    'corrected' 'for' target=STRING '{' fields+=Field* '}';
```

And append `'corrected'` and `'for'` to the `Name` alias (so they work as identifiers in non-declaration positions too):

```text
Name returns string:
    ID | 'agent' | 'route' | 'persona' | 'provider' | 'fallback' | 'memory' | 'harness' | 'plugin' | 'trigger' | 'corrected' | 'for';
```

- [ ] **Step 5: Regenerate + run tests**

```bash
pnpm --filter @vibe/language build
pnpm --filter @vibe/language test test/primitives/corrected.test.ts
```

Expected: `3 passed`.

- [ ] **Step 6: Run full suite to confirm no SD1 regression**

```bash
pnpm --filter @vibe/language test
```

Expected: 165+ passed (160 SD1 + new dispatcher + corrected).

- [ ] **Step 7: Commit**

```bash
git add packages/language/src/vibe.langium \
        packages/language/test/primitives/corrected.test.ts \
        packages/language/test/ast-helpers.ts
git commit -m "$(cat <<'EOF'
feat(language): Corrected declaration with target tag

Adds 'corrected for "tag" { ... }' as a new top-level declaration so
SD2's resolver overrides are visible to the parser, validator, and
downstream tools. The target string ties a corrected block back to
a specific resolver invocation by its content-tag.

Both 'corrected' and 'for' are appended to the Name alias so they
work as identifiers in field-name and reference positions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 8: Validator for `corrected` blocks — target must be non-empty

**Files:**
- Modify: `packages/language/src/vibe-validator.ts`
- Create: `packages/language/test/validators/corrected-target.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/language/test/validators/corrected-target.test.ts`:

```ts
import { EmptyFileSystem } from "langium";
import { parseHelper } from "langium/test";
import { describe, expect, it } from "vitest";
import type { Project } from "../../src/generated/ast.js";
import { createVibeServices } from "../../src/vibe-module.js";

const services = createVibeServices(EmptyFileSystem).Vibe;
const parse = parseHelper<Project>(services);

async function diagnosticMessages(source: string): Promise<string[]> {
  const document = await parse(source);
  await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
  return document.diagnostics?.map((d) => d.message) ?? [];
}

describe("corrected target validator", () => {
  it("accepts a non-empty target", async () => {
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = api }
      route resolver -> cerebras.glm_4_7
      corrected for "resolver#tag" { description = "x" }
    `);
    expect(messages.filter((m) => /target/i.test(m))).toEqual([]);
  });

  it("rejects an empty target", async () => {
    const messages = await diagnosticMessages(`
      provider cerebras.glm_4_7 { mode = api }
      route resolver -> cerebras.glm_4_7
      corrected for "" { description = "x" }
    `);
    expect(messages).toContain("`corrected` target must not be empty.");
  });
});
```

- [ ] **Step 2: Run tests — expect failure (target validator not implemented)**

- [ ] **Step 3: Add the validator check**

In `packages/language/src/vibe-validator.ts`, add a `checkCorrectedTarget` method that walks `project.declarations`, finds `Corrected` nodes, and emits an error when `target` is empty or whitespace-only. Wire it into `registerValidationChecks`.

```ts
// Add to VibeValidator class:
checkCorrectedTarget(project: Project, accept: ValidationAcceptor): void {
  for (const decl of project.declarations) {
    if (decl.$type !== "Corrected") continue;
    const target = decl.target?.trim() ?? "";
    if (target.length === 0) {
      accept("error", "`corrected` target must not be empty.", {
        node: decl,
        property: "target",
      });
    }
  }
}
```

And in `registerValidationChecks`:

```ts
const checks: ValidationChecks<VibeAstType> = {
  Project: [
    validator.checkDuplicateDeclarations.bind(validator),
    validator.checkResolverRoute.bind(validator),
    validator.checkCrossReferences.bind(validator),
    validator.checkCorrectedTarget.bind(validator), // NEW
  ],
};
```

- [ ] **Step 4: Run tests — expect pass**

Expected: `2 passed`. Full suite: 167+ passing.

- [ ] **Step 5: Commit**

```bash
git add packages/language/src/vibe-validator.ts \
        packages/language/test/validators/corrected-target.test.ts
git commit -m "$(cat <<'EOF'
feat(language): validator rejects empty corrected target

A corrected block without a target string cannot be merged back to
a resolver invocation, so it has no semantics. Validator catches
this at the source level.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase C — Cache (Tasks 9-10)

Resolver outputs are cached keyed by `(content hash, model id, temperature)`. Re-running the same source through the same model at the same temperature must return the cached value without hitting the provider.

### Task 9: Content-addressed cache types + key derivation

**Files:**
- Create: `packages/language/src/resolver/types.ts`
- Create: `packages/language/src/resolver/cache.ts`
- Create: `packages/language/test/resolver/cache.test.ts`

- [ ] **Step 1: Write types**

`packages/language/src/resolver/types.ts`:

```ts
import type { ProseRegion } from "../dispatcher/types.js";
export type { ProseRegion };

export interface Variance {
  /** Provider id used for this resolution (e.g. "cerebras.glm_4_7"). */
  provider: string;
  /** Model id within the provider (e.g. "zai-glm-4.7"). */
  model: string;
  /** Sampling temperature used. */
  temperature: number;
  /** Timestamp the resolution was recorded (ISO 8601). */
  at: string;
}

export interface ResolverContext {
  /** Provider id to use for the LLM call. Looked up in the registry. */
  provider: string;
  /** Model id within the provider. */
  model: string;
  /** Sampling temperature; default 0.3. */
  temperature?: number;
  /** Optional cache instance — if absent, a fresh in-memory cache is used per call. */
  cache?: ContentAddressedCache;
  /** Optional declared-primitives summary the resolver hands to the LLM as context. */
  primitives?: PrimitivesSummary;
}

export interface PrimitivesSummary {
  agents: string[];
  personas: string[];
  providers: string[];
  routes: string[];
  /** ... add as the SD2 implementation needs them. */
}

export interface ResolverResult<T = unknown> {
  /** The parsed structured output. */
  value: T;
  /** Provenance metadata. */
  variance: Variance;
  /** Whether this result came from the cache (vs. a fresh provider call). */
  cached: boolean;
  /** The deterministic key used for cache lookup. */
  cacheKey: string;
}

export interface ContentAddressedCache {
  get(key: string): ResolverResult | undefined;
  set(key: string, value: ResolverResult): void;
  size(): number;
}
```

- [ ] **Step 2: Write the failing tests**

`packages/language/test/resolver/cache.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeCacheKey, createInMemoryCache } from "../../src/resolver/cache.js";
import type { ResolverResult } from "../../src/resolver/types.js";

const sampleResult: ResolverResult<{ x: number }> = {
  value: { x: 1 },
  variance: { provider: "cerebras.glm_4_7", model: "zai-glm-4.7", temperature: 0.3, at: "2026-05-14T00:00:00Z" },
  cached: false,
  cacheKey: "ignored",
};

describe("computeCacheKey", () => {
  it("produces a stable hex string for the same inputs", () => {
    const a = computeCacheKey("hello", "zai-glm-4.7", 0.3);
    const b = computeCacheKey("hello", "zai-glm-4.7", 0.3);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when content changes", () => {
    const a = computeCacheKey("hello", "zai-glm-4.7", 0.3);
    const b = computeCacheKey("hello world", "zai-glm-4.7", 0.3);
    expect(a).not.toBe(b);
  });

  it("changes when model changes", () => {
    const a = computeCacheKey("hello", "zai-glm-4.7", 0.3);
    const b = computeCacheKey("hello", "claude-4.7", 0.3);
    expect(a).not.toBe(b);
  });

  it("changes when temperature changes", () => {
    const a = computeCacheKey("hello", "zai-glm-4.7", 0.3);
    const b = computeCacheKey("hello", "zai-glm-4.7", 0.7);
    expect(a).not.toBe(b);
  });
});

describe("createInMemoryCache", () => {
  it("get returns undefined for unknown keys", () => {
    const cache = createInMemoryCache();
    expect(cache.get("nope")).toBeUndefined();
  });

  it("get returns the set value", () => {
    const cache = createInMemoryCache();
    cache.set("k1", sampleResult);
    expect(cache.get("k1")).toEqual(sampleResult);
  });

  it("size grows with each unique set", () => {
    const cache = createInMemoryCache();
    cache.set("k1", sampleResult);
    cache.set("k2", sampleResult);
    expect(cache.size()).toBe(2);
  });
});
```

- [ ] **Step 3: Run tests — expect failure**

- [ ] **Step 4: Write the implementation**

`packages/language/src/resolver/cache.ts`:

```ts
import { createHash } from "node:crypto";
import type { ContentAddressedCache, ResolverResult } from "./types.js";

export function computeCacheKey(content: string, model: string, temperature: number): string {
  const hash = createHash("sha256");
  hash.update("v1\n");           // versioned so we can break cache shape later
  hash.update(`${content}\n`);
  hash.update(`${model}\n`);
  hash.update(`${temperature}\n`);
  return hash.digest("hex");
}

export function createInMemoryCache(): ContentAddressedCache {
  const store = new Map<string, ResolverResult>();
  return {
    get: (key) => store.get(key),
    set: (key, value) => { store.set(key, value); },
    size: () => store.size,
  };
}
```

- [ ] **Step 5: Run tests — expect pass**

Expected: `7 passed`.

- [ ] **Step 6: Commit**

```bash
git add packages/language/src/resolver/types.ts \
        packages/language/src/resolver/cache.ts \
        packages/language/test/resolver/cache.test.ts
git commit -m "$(cat <<'EOF'
feat(resolver): content-addressed cache + key derivation

SHA-256 over (versioned-prefix, content, model, temperature). In-memory
backing store via Map. Versioned prefix lets future cache-shape changes
invalidate cleanly without renaming the key field.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 10: Variance helpers

**Files:**
- Create: `packages/language/src/resolver/variance.ts`
- Create: `packages/language/test/resolver/variance.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/language/test/resolver/variance.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { formatVariance, makeVariance } from "../../src/resolver/variance.js";

describe("makeVariance", () => {
  it("builds a Variance with the current ISO timestamp", () => {
    const before = Date.now();
    const v = makeVariance({ provider: "cerebras.glm_4_7", model: "zai-glm-4.7", temperature: 0.3 });
    const after = Date.now();
    expect(v.provider).toBe("cerebras.glm_4_7");
    expect(v.model).toBe("zai-glm-4.7");
    expect(v.temperature).toBe(0.3);
    const atMs = Date.parse(v.at);
    expect(atMs).toBeGreaterThanOrEqual(before);
    expect(atMs).toBeLessThanOrEqual(after);
  });

  it("respects an injected `at`", () => {
    const v = makeVariance({ provider: "p", model: "m", temperature: 0, at: "2026-01-01T00:00:00Z" });
    expect(v.at).toBe("2026-01-01T00:00:00Z");
  });
});

describe("formatVariance", () => {
  it("renders the canonical one-line provenance string", () => {
    const v = { provider: "cerebras.glm_4_7", model: "zai-glm-4.7", temperature: 0.3, at: "2026-05-14T03:00:00Z" };
    expect(formatVariance(v)).toBe("resolver: cerebras.glm_4_7, model: zai-glm-4.7, t: 0.3, at: 2026-05-14T03:00:00Z");
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

- [ ] **Step 3: Write the implementation**

`packages/language/src/resolver/variance.ts`:

```ts
import type { Variance } from "./types.js";

export interface MakeVarianceInput {
  provider: string;
  model: string;
  temperature: number;
  at?: string;
}

export function makeVariance(input: MakeVarianceInput): Variance {
  return {
    provider: input.provider,
    model: input.model,
    temperature: input.temperature,
    at: input.at ?? new Date().toISOString(),
  };
}

export function formatVariance(v: Variance): string {
  return `resolver: ${v.provider}, model: ${v.model}, t: ${v.temperature}, at: ${v.at}`;
}
```

- [ ] **Step 4: Run tests — expect pass**

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/language/src/resolver/variance.ts \
        packages/language/test/resolver/variance.test.ts
git commit -m "$(cat <<'EOF'
feat(resolver): variance metadata + canonical format

Every resolver call records (provider, model, temperature, at) so
re-runs can diff against prior outputs. formatVariance emits the
one-line provenance string the architecture spec calls out:
"resolver: cerebras.glm-4.7, t: 0.3, at: 2026-05-14T..."

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase D — Provider adapter shape (Tasks 11-13)

Providers are pluggable LLM endpoints. SD2 ships with two: a mock (for tests), and Cerebras (the default for resolver calls). CLI providers come in Phase F.

### Task 11: Provider interface + ChatMessage types + MockProvider

**Files:**
- Create: `packages/language/src/providers/types.ts`
- Create: `packages/language/src/providers/mock.ts`
- Create: `packages/language/test/providers/mock.test.ts`

- [ ] **Step 1: Write types + tests**

`packages/language/src/providers/types.ts`:

```ts
export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface GenerateObjectRequest<TSchema = unknown> {
  messages: ChatMessage[];
  /** Zod schema (any zod type at runtime) used to validate / shape the output. */
  schema: TSchema;
  /** Sampling temperature; provider may clamp to its valid range. */
  temperature?: number;
  /** Maximum output tokens; provider may have its own ceiling. */
  maxOutputTokens?: number;
}

export interface GenerateObjectResponse<T = unknown> {
  /** The parsed value, already validated against the schema. */
  value: T;
  /** Raw token usage info from the provider, when available. */
  usage?: { inputTokens?: number; outputTokens?: number };
}

export type ProviderMode = "api" | "cli";

export interface ProviderAdapter {
  /** Provider id, e.g. "cerebras.glm_4_7" or "anthropic.claude_code". */
  id: string;
  /** Mode this adapter operates in. */
  mode: ProviderMode;
  /** Generate a typed object response. */
  generateObject<T>(req: GenerateObjectRequest): Promise<GenerateObjectResponse<T>>;
}
```

`packages/language/src/providers/mock.ts`:

```ts
import type {
  GenerateObjectRequest,
  GenerateObjectResponse,
  ProviderAdapter,
} from "./types.js";

export interface MockProviderOptions {
  id?: string;
  mode?: "api" | "cli";
  /** Static response value returned for every call. */
  response: unknown;
}

export function createMockProvider(opts: MockProviderOptions): ProviderAdapter & {
  /** Captured request history for assertions in tests. */
  history: GenerateObjectRequest[];
} {
  const history: GenerateObjectRequest[] = [];
  return {
    id: opts.id ?? "mock.fixture",
    mode: opts.mode ?? "api",
    history,
    async generateObject<T>(req: GenerateObjectRequest): Promise<GenerateObjectResponse<T>> {
      history.push(req);
      return { value: opts.response as T };
    },
  };
}
```

`packages/language/test/providers/mock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createMockProvider } from "../../src/providers/mock.js";

describe("createMockProvider", () => {
  it("returns the configured response", async () => {
    const provider = createMockProvider({ response: { ok: true } });
    const result = await provider.generateObject({
      messages: [{ role: "user", content: "hi" }],
      schema: {},
    });
    expect(result.value).toEqual({ ok: true });
  });

  it("captures request history for assertion", async () => {
    const provider = createMockProvider({ response: { ok: true } });
    await provider.generateObject({
      messages: [{ role: "user", content: "ping" }],
      schema: {},
    });
    expect(provider.history).toHaveLength(1);
    expect(provider.history[0].messages[0].content).toBe("ping");
  });

  it("defaults to id mock.fixture and mode api", () => {
    const provider = createMockProvider({ response: 0 });
    expect(provider.id).toBe("mock.fixture");
    expect(provider.mode).toBe("api");
  });
});
```

- [ ] **Step 2: Run tests — expect pass**

Expected: `3 passed`.

- [ ] **Step 3: Commit**

```bash
git add packages/language/src/providers/types.ts \
        packages/language/src/providers/mock.ts \
        packages/language/test/providers/mock.test.ts
git commit -m "$(cat <<'EOF'
feat(providers): ProviderAdapter interface + MockProvider

Defines the minimal generateObject surface every adapter must
implement. MockProvider captures request history so resolver tests
can assert prompt content without hitting a real LLM.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 12: Provider registry

**Files:**
- Create: `packages/language/src/providers/index.ts`
- Create: `packages/language/test/providers/registry.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/language/test/providers/registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createMockProvider } from "../../src/providers/mock.js";
import { createProviderRegistry } from "../../src/providers/index.js";

describe("ProviderRegistry", () => {
  it("registers and looks up by id", () => {
    const registry = createProviderRegistry();
    const provider = createMockProvider({ id: "mock.a", response: {} });
    registry.register(provider);
    expect(registry.get("mock.a")).toBe(provider);
  });

  it("returns undefined for unknown ids", () => {
    const registry = createProviderRegistry();
    expect(registry.get("nope")).toBeUndefined();
  });

  it("rejects duplicate registration", () => {
    const registry = createProviderRegistry();
    registry.register(createMockProvider({ id: "mock.dup", response: 1 }));
    expect(() =>
      registry.register(createMockProvider({ id: "mock.dup", response: 2 })),
    ).toThrow(/already registered/i);
  });

  it("lists all registered ids", () => {
    const registry = createProviderRegistry();
    registry.register(createMockProvider({ id: "mock.a", response: {} }));
    registry.register(createMockProvider({ id: "mock.b", response: {} }));
    expect(registry.ids()).toEqual(["mock.a", "mock.b"]);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

- [ ] **Step 3: Write the implementation**

`packages/language/src/providers/index.ts`:

```ts
import type { ProviderAdapter } from "./types.js";

export type { ProviderAdapter, ProviderMode, ChatMessage, ChatRole, GenerateObjectRequest, GenerateObjectResponse } from "./types.js";
export { createMockProvider } from "./mock.js";

export interface ProviderRegistry {
  register(adapter: ProviderAdapter): void;
  get(id: string): ProviderAdapter | undefined;
  ids(): string[];
}

export function createProviderRegistry(): ProviderRegistry {
  const map = new Map<string, ProviderAdapter>();
  return {
    register(adapter) {
      if (map.has(adapter.id)) {
        throw new Error(`Provider \`${adapter.id}\` is already registered.`);
      }
      map.set(adapter.id, adapter);
    },
    get(id) {
      return map.get(id);
    },
    ids() {
      return [...map.keys()];
    },
  };
}
```

- [ ] **Step 4: Run tests — expect pass**

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/language/src/providers/index.ts \
        packages/language/test/providers/registry.test.ts
git commit -m "$(cat <<'EOF'
feat(providers): ProviderRegistry with by-id lookup + dup detection

Registry is the resolver's narrow surface onto the provider layer.
Duplicate registration throws rather than silently shadowing so a
mis-wired adapter is loud during boot.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 13: Cerebras API adapter via @ai-sdk/openai-compatible

**Files:**
- Create: `packages/language/src/providers/api/cerebras.ts`
- Create: `packages/language/test/providers/api/cerebras.test.ts`
- Modify: `packages/language/package.json` (add `ai`, `@ai-sdk/openai-compatible`, `zod`)

- [ ] **Step 1: Add dependencies**

```bash
cd c:/Hive/vibe
pnpm --filter @vibe/language add ai@^6 @ai-sdk/openai-compatible@^6 zod@^4
```

- [ ] **Step 2: Write the failing tests**

`packages/language/test/providers/api/cerebras.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createCerebrasProvider } from "../../../src/providers/api/cerebras.js";

describe("createCerebrasProvider", () => {
  it("returns a ProviderAdapter with the expected id and mode", () => {
    const provider = createCerebrasProvider({
      apiKey: "sk-fake",
      baseUrl: "https://example.invalid/v1",
      model: "zai-glm-4.7",
    });
    expect(provider.id).toBe("cerebras.zai-glm-4.7");
    expect(provider.mode).toBe("api");
  });

  it("accepts a custom id override", () => {
    const provider = createCerebrasProvider({
      apiKey: "sk-fake",
      baseUrl: "https://example.invalid/v1",
      model: "zai-glm-4.7",
      id: "cerebras.glm_4_7",
    });
    expect(provider.id).toBe("cerebras.glm_4_7");
  });

  it("throws when apiKey is missing", () => {
    expect(() =>
      createCerebrasProvider({
        apiKey: "",
        baseUrl: "https://example.invalid/v1",
        model: "zai-glm-4.7",
      }),
    ).toThrow(/api key/i);
  });

  // Note: a live generateObject test would hit Cerebras. SD2 ships a
  // recorded-fixture path - exercised in Task 17 - rather than mocking AI
  // SDK internals here. This file only covers the adapter's construction
  // contract.
});
```

- [ ] **Step 3: Run tests — expect failure**

- [ ] **Step 4: Write the implementation**

`packages/language/src/providers/api/cerebras.ts`:

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";
import type {
  GenerateObjectRequest,
  GenerateObjectResponse,
  ProviderAdapter,
} from "../types.js";

export interface CerebrasProviderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Optional id override; defaults to `cerebras.<model>`. */
  id?: string;
}

export function createCerebrasProvider(opts: CerebrasProviderOptions): ProviderAdapter {
  if (!opts.apiKey) {
    throw new Error("Cerebras adapter: api key is required (pass apiKey:'sk-...').");
  }
  const id = opts.id ?? `cerebras.${opts.model}`;
  const client = createOpenAICompatible({
    name: "cerebras",
    apiKey: opts.apiKey,
    baseURL: opts.baseUrl,
  });

  return {
    id,
    mode: "api",
    async generateObject<T>(req: GenerateObjectRequest): Promise<GenerateObjectResponse<T>> {
      const result = await generateObject({
        model: client(opts.model),
        messages: req.messages,
        // The Vercel AI SDK 6 generateObject signature accepts a Zod schema or
        // a JSON schema. The Resolver passes Zod; we pass it through unchanged.
        schema: req.schema as never,
        temperature: req.temperature,
        maxOutputTokens: req.maxOutputTokens,
      });
      return {
        value: result.object as T,
        usage: {
          inputTokens: result.usage?.inputTokens,
          outputTokens: result.usage?.outputTokens,
        },
      };
    },
  };
}
```

- [ ] **Step 5: Run tests — expect pass**

Expected: `3 passed`.

- [ ] **Step 6: Commit**

```bash
git add packages/language/src/providers/api/cerebras.ts \
        packages/language/test/providers/api/cerebras.test.ts \
        packages/language/package.json \
        pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(providers): Cerebras API adapter via @ai-sdk/openai-compatible

Wraps the Vercel AI SDK 6 generateObject call against Cerebras's
OpenAI-compatible endpoint. Pass-through for messages, schema (Zod),
temperature, maxOutputTokens. Returns usage metadata when the SDK
surfaces it.

Adds ai@6, @ai-sdk/openai-compatible@6, zod@4 to deps.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase E — Resolver core (Tasks 14-17)

The resolver takes a `ProseRegion` + `ResolverContext`, looks up the provider, builds the prompt, calls the provider, validates the output against the schema, caches the result, and returns a `ResolverResult` with provenance.

### Task 14: Prompt construction

**Files:**
- Create: `packages/language/src/resolver/prompts.ts`
- Create: `packages/language/test/resolver/prompts.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/language/test/resolver/prompts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  buildUserPrompt,
} from "../../src/resolver/prompts.js";

describe("buildSystemPrompt", () => {
  it("mentions the canonical Vibe contract", () => {
    const prompt = buildSystemPrompt({ primitives: { agents: [], personas: [], providers: [], routes: [] } });
    expect(prompt.toLowerCase()).toContain("vibe");
    expect(prompt.toLowerCase()).toContain("structured");
  });

  it("includes declared primitives when supplied", () => {
    const prompt = buildSystemPrompt({
      primitives: { agents: ["izsha"], personas: ["coordinator"], providers: ["cerebras.glm_4_7"], routes: ["resolver"] },
    });
    expect(prompt).toContain("izsha");
    expect(prompt).toContain("coordinator");
    expect(prompt).toContain("cerebras.glm_4_7");
    expect(prompt).toContain("resolver");
  });
});

describe("buildUserPrompt", () => {
  it("wraps the prose with a clear delimiter", () => {
    const prompt = buildUserPrompt({ prose: "Make an agent named Izsha." });
    expect(prompt).toContain("Make an agent named Izsha.");
    // The delimiter shape is part of the contract so the LLM does not confuse
    // the prose with system instructions.
    expect(prompt).toMatch(/<prose>[\s\S]*<\/prose>/);
  });

  it("respects role hint when present", () => {
    const prompt = buildUserPrompt({ prose: "ok", role: "user" });
    expect(prompt.toLowerCase()).toContain("role: user");
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

- [ ] **Step 3: Write the implementation**

`packages/language/src/resolver/prompts.ts`:

```ts
import type { PrimitivesSummary } from "./types.js";

export interface SystemPromptInput {
  primitives: PrimitivesSummary;
}

export function buildSystemPrompt(input: SystemPromptInput): string {
  const lines: string[] = [];
  lines.push("You are the Vibe LLM resolver.");
  lines.push("");
  lines.push("Vibe is a hybrid specification language. Structured regions of a .vibe");
  lines.push("source are parsed deterministically; prose regions go through you, the");
  lines.push("resolver, to produce typed structured output.");
  lines.push("");
  lines.push("Constraints:");
  lines.push("- You must produce output that conforms to the provided JSON schema.");
  lines.push("- You must not invent identifiers that are not in the declared primitives below.");
  lines.push("- When uncertain, prefer omitting an optional field over guessing.");
  lines.push("");
  lines.push("Declared primitives in this project:");
  const { agents, personas, providers, routes } = input.primitives;
  lines.push(`- agents: ${formatList(agents)}`);
  lines.push(`- personas: ${formatList(personas)}`);
  lines.push(`- providers: ${formatList(providers)}`);
  lines.push(`- routes: ${formatList(routes)}`);
  return lines.join("\n");
}

function formatList(items: string[]): string {
  if (items.length === 0) return "(none declared)";
  return items.join(", ");
}

export interface UserPromptInput {
  prose: string;
  role?: "user" | "assistant" | "system";
}

export function buildUserPrompt(input: UserPromptInput): string {
  const role = input.role ? `role: ${input.role}\n\n` : "";
  return `${role}<prose>\n${input.prose}\n</prose>`;
}
```

- [ ] **Step 4: Run tests — expect pass**

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/language/src/resolver/prompts.ts \
        packages/language/test/resolver/prompts.test.ts
git commit -m "$(cat <<'EOF'
feat(resolver): prompt construction (system + user)

System prompt anchors the LLM to the Vibe contract and lists the
project's declared primitives so the resolver cannot invent
identifiers. User prompt wraps the prose with a <prose> tag delimiter
so the LLM cannot confuse prose with system instructions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 15: resolveProse — orchestrator, happy path

**Files:**
- Create: `packages/language/src/resolver/index.ts`
- Create: `packages/language/test/resolver/resolve.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/language/test/resolver/resolve.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ProseRegion } from "../../src/dispatcher/types.js";
import { createMockProvider } from "../../src/providers/mock.js";
import { createProviderRegistry } from "../../src/providers/index.js";
import { resolveProse } from "../../src/resolver/index.js";

const proseRegion: ProseRegion = {
  kind: "prose",
  start: 0,
  end: 32,
  text: "Make an agent named Izsha.",
  role: "user",
};

const schema = z.object({ name: z.string(), description: z.string() });

describe("resolveProse — happy path", () => {
  it("returns the provider's output, wrapped with variance", async () => {
    const provider = createMockProvider({
      id: "mock.api",
      response: { name: "izsha", description: "coordinator, dry" },
    });
    const registry = createProviderRegistry();
    registry.register(provider);

    const result = await resolveProse({
      region: proseRegion,
      context: {
        provider: "mock.api",
        model: "mock-model",
        temperature: 0.3,
        primitives: { agents: [], personas: [], providers: [], routes: [] },
      },
      schema,
      registry,
    });

    expect(result.value).toEqual({ name: "izsha", description: "coordinator, dry" });
    expect(result.variance.provider).toBe("mock.api");
    expect(result.variance.model).toBe("mock-model");
    expect(result.variance.temperature).toBe(0.3);
    expect(typeof result.variance.at).toBe("string");
    expect(result.cached).toBe(false);
  });

  it("hits the cache on the second call with the same inputs", async () => {
    const provider = createMockProvider({ id: "mock.api2", response: { name: "x", description: "y" } });
    const registry = createProviderRegistry();
    registry.register(provider);
    const cache = (await import("../../src/resolver/cache.js")).createInMemoryCache();

    const ctx = {
      provider: "mock.api2",
      model: "mock-model",
      temperature: 0.3,
      cache,
      primitives: { agents: [], personas: [], providers: [], routes: [] },
    };

    const first = await resolveProse({ region: proseRegion, context: ctx, schema, registry });
    const second = await resolveProse({ region: proseRegion, context: ctx, schema, registry });
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(provider.history).toHaveLength(1); // only the first call hit the provider
  });

  it("throws when the provider id is not registered", async () => {
    const registry = createProviderRegistry();
    await expect(
      resolveProse({
        region: proseRegion,
        context: { provider: "missing", model: "m", temperature: 0.3 },
        schema,
        registry,
      }),
    ).rejects.toThrow(/missing/);
  });

  it("propagates schema validation failures from the provider", async () => {
    const provider = createMockProvider({ id: "mock.bad", response: { wrong: true } });
    const registry = createProviderRegistry();
    registry.register(provider);
    await expect(
      resolveProse({
        region: proseRegion,
        context: { provider: "mock.bad", model: "m", temperature: 0.3 },
        schema,
        registry,
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

- [ ] **Step 3: Write the implementation**

`packages/language/src/resolver/index.ts`:

```ts
import type { ZodTypeAny, z } from "zod";
import type { ProseRegion } from "../dispatcher/types.js";
import type { ProviderRegistry } from "../providers/index.js";
import { computeCacheKey, createInMemoryCache } from "./cache.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompts.js";
import type { ResolverContext, ResolverResult } from "./types.js";
import { makeVariance } from "./variance.js";

export type { ResolverContext, ResolverResult, Variance, PrimitivesSummary } from "./types.js";
export { computeCacheKey, createInMemoryCache } from "./cache.js";
export { formatVariance, makeVariance } from "./variance.js";

export interface ResolveProseInput<TSchema extends ZodTypeAny> {
  region: ProseRegion;
  context: ResolverContext;
  schema: TSchema;
  registry: ProviderRegistry;
}

export async function resolveProse<TSchema extends ZodTypeAny>(
  input: ResolveProseInput<TSchema>,
): Promise<ResolverResult<z.infer<TSchema>>> {
  const { region, context, schema, registry } = input;
  const adapter = registry.get(context.provider);
  if (!adapter) {
    throw new Error(`resolveProse: provider \`${context.provider}\` is not registered.`);
  }
  const temperature = context.temperature ?? 0.3;
  const cache = context.cache ?? createInMemoryCache();
  const cacheKey = computeCacheKey(region.text, context.model, temperature);

  const hit = cache.get(cacheKey);
  if (hit) {
    return { ...hit, cached: true } as ResolverResult<z.infer<TSchema>>;
  }

  const messages = [
    { role: "system" as const, content: buildSystemPrompt({ primitives: context.primitives ?? { agents: [], personas: [], providers: [], routes: [] } }) },
    { role: "user" as const, content: buildUserPrompt({ prose: region.text, role: region.role }) },
  ];

  const response = await adapter.generateObject<unknown>({
    messages,
    schema: schema as unknown,
    temperature,
  });

  // Validate. If the provider returns garbage, the resolver surfaces a typed
  // ZodError rather than silently emitting bad data.
  const parsed = schema.parse(response.value);

  const variance = makeVariance({ provider: context.provider, model: context.model, temperature });
  const result: ResolverResult<z.infer<TSchema>> = {
    value: parsed,
    variance,
    cached: false,
    cacheKey,
  };
  cache.set(cacheKey, result as ResolverResult);
  return result;
}
```

- [ ] **Step 4: Run tests — expect pass**

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/language/src/resolver/index.ts \
        packages/language/test/resolver/resolve.test.ts
git commit -m "$(cat <<'EOF'
feat(resolver): resolveProse orchestrator with cache + zod validation

Single happy-path entry. Looks up the provider, computes the cache
key, returns cached result if present, otherwise builds prompt,
calls provider.generateObject, validates against the Zod schema,
records variance, stores in cache.

Throws on unknown provider id and propagates ZodError on schema
validation failure - no silent corruption.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 16: Corrections merge

**Files:**
- Create: `packages/language/src/resolver/corrections.ts`
- Create: `packages/language/test/resolver/corrections.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/language/test/resolver/corrections.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mergeCorrected } from "../../src/resolver/corrections.js";

describe("mergeCorrected", () => {
  it("returns resolver value unchanged when no correction supplied", () => {
    const resolved = { name: "izsha", description: "coordinator, dry" };
    const merged = mergeCorrected({ resolved, corrected: undefined });
    expect(merged.value).toEqual(resolved);
    expect(merged.overrides).toEqual([]);
  });

  it("applies a corrected override to a single field", () => {
    const resolved = { name: "izsha", description: "coordinator, dry" };
    const corrected = { description: "human override" };
    const merged = mergeCorrected({ resolved, corrected });
    expect(merged.value).toEqual({ name: "izsha", description: "human override" });
    expect(merged.overrides).toEqual(["description"]);
  });

  it("applies multiple overrides", () => {
    const resolved = { a: 1, b: 2, c: 3 };
    const corrected = { a: 11, c: 33 };
    const merged = mergeCorrected({ resolved, corrected });
    expect(merged.value).toEqual({ a: 11, b: 2, c: 33 });
    expect(merged.overrides.sort()).toEqual(["a", "c"]);
  });

  it("preserves resolver fields not mentioned in corrected", () => {
    const resolved = { a: 1, b: 2 };
    const corrected = { a: 11 };
    const merged = mergeCorrected({ resolved, corrected });
    expect((merged.value as Record<string, unknown>).b).toBe(2);
  });

  it("ignores unknown corrected keys (logs but does not throw)", () => {
    const resolved = { a: 1 };
    const corrected = { b: 99 };
    const merged = mergeCorrected({ resolved, corrected });
    expect(merged.value).toEqual({ a: 1 });
    expect(merged.unknownKeys).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

- [ ] **Step 3: Write the implementation**

`packages/language/src/resolver/corrections.ts`:

```ts
export interface MergeCorrectedInput<T extends object> {
  resolved: T;
  corrected: Partial<T> | undefined;
}

export interface MergedResult<T extends object> {
  value: T;
  /** Keys that came from `corrected` and were applied. */
  overrides: string[];
  /** Keys in `corrected` that were NOT present on `resolved` and got dropped. */
  unknownKeys: string[];
}

export function mergeCorrected<T extends object>(input: MergeCorrectedInput<T>): MergedResult<T> {
  const { resolved, corrected } = input;
  if (!corrected) {
    return { value: resolved, overrides: [], unknownKeys: [] };
  }
  const value = { ...resolved } as T;
  const overrides: string[] = [];
  const unknownKeys: string[] = [];
  for (const [key, override] of Object.entries(corrected)) {
    if (Object.prototype.hasOwnProperty.call(resolved, key)) {
      (value as Record<string, unknown>)[key] = override;
      overrides.push(key);
    } else {
      unknownKeys.push(key);
    }
  }
  return { value, overrides, unknownKeys };
}
```

- [ ] **Step 4: Run tests — expect pass**

Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/language/src/resolver/corrections.ts \
        packages/language/test/resolver/corrections.test.ts
git commit -m "$(cat <<'EOF'
feat(resolver): mergeCorrected applies adjacent corrected blocks

Per-key shallow merge: corrected wins on overlap. Tracks which keys
were overridden and which corrected keys were unknown (dropped),
so the variance record can surface both.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 17: Cerebras recorded-fixture test (end-to-end without live LLM)

**Files:**
- Create: `packages/language/test/fixtures/recordings/cerebras-hello.json`
- Create: `packages/language/test/providers/api/cerebras-recorded.test.ts`

- [ ] **Step 1: Capture a recorded response shape**

The fixture mimics what `generateObject` would return from Cerebras for a fixed prompt. Save:

`packages/language/test/fixtures/recordings/cerebras-hello.json`:

```json
{
  "request": {
    "messages": [
      { "role": "system", "content": "<system-prompt-elided>" },
      { "role": "user", "content": "<prose>Make an agent named Izsha.</prose>" }
    ],
    "temperature": 0.3,
    "model": "zai-glm-4.7"
  },
  "response": {
    "name": "izsha",
    "description": "coordinator, dry"
  }
}
```

- [ ] **Step 2: Write the failing test**

`packages/language/test/providers/api/cerebras-recorded.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMockProvider } from "../../../src/providers/mock.js";
import { createProviderRegistry } from "../../../src/providers/index.js";
import { resolveProse } from "../../../src/resolver/index.js";

const FIXTURE_DIR = fileURLToPath(new URL("../../fixtures/recordings/", import.meta.url));

interface Recording {
  request: { messages: Array<{ role: "user" | "system" | "assistant"; content: string }>; temperature: number; model: string };
  response: unknown;
}

async function loadRecording(name: string): Promise<Recording> {
  const text = await readFile(`${FIXTURE_DIR}${name}.json`, "utf8");
  return JSON.parse(text) as Recording;
}

describe("Cerebras recorded fixture replay", () => {
  it("a recorded Cerebras response round-trips through resolveProse", async () => {
    const rec = await loadRecording("cerebras-hello");
    const provider = createMockProvider({
      id: "cerebras.glm_4_7",
      response: rec.response,
    });
    const registry = createProviderRegistry();
    registry.register(provider);

    const schema = z.object({ name: z.string(), description: z.string() });
    const result = await resolveProse({
      region: {
        kind: "prose",
        start: 0,
        end: rec.request.messages[1].content.length,
        text: "Make an agent named Izsha.",
        role: "user",
      },
      context: { provider: "cerebras.glm_4_7", model: rec.request.model, temperature: rec.request.temperature },
      schema,
      registry,
    });

    expect(result.value).toEqual(rec.response);
    expect(result.variance.model).toBe("zai-glm-4.7");
  });
});
```

- [ ] **Step 3: Run tests — expect pass**

Expected: `1 passed`. The actual Cerebras adapter isn't exercised here (no live network) — the test proves the resolver + provider abstraction can replay a Cerebras-shaped response end-to-end.

- [ ] **Step 4: Commit**

```bash
git add packages/language/test/fixtures/recordings/cerebras-hello.json \
        packages/language/test/providers/api/cerebras-recorded.test.ts
git commit -m "$(cat <<'EOF'
test(providers): replay a recorded Cerebras response through resolveProse

Proves the resolver + provider abstraction handles a Cerebras-shaped
response end-to-end without hitting the network. The fixture file
becomes the contract for future generateObject changes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase F — CLI providers (Tasks 18-19)

CLI providers spawn local subprocess binaries that speak a per-CLI protocol over stdio. SD2 ships the base + claude CLI shim; codex and gemini follow in later phases.

### Task 18: CLI provider base + claude CLI shim

**Files:**
- Create: `packages/language/src/providers/cli/base.ts`
- Create: `packages/language/src/providers/cli/claude.ts`
- Create: `packages/language/test/providers/cli/claude.test.ts`
- Modify: `packages/language/package.json` (add `execa`)

- [ ] **Step 1: Add execa dependency**

```bash
cd c:/Hive/vibe
pnpm --filter @vibe/language add execa@^9
```

- [ ] **Step 2: Write the failing tests**

`packages/language/test/providers/cli/claude.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createClaudeCliProvider } from "../../../src/providers/cli/claude.js";

describe("createClaudeCliProvider", () => {
  it("creates a ProviderAdapter with mode cli and the expected id", () => {
    const provider = createClaudeCliProvider({ binary: "claude" });
    expect(provider.mode).toBe("cli");
    expect(provider.id).toBe("anthropic.claude_code");
  });

  it("supports id override", () => {
    const provider = createClaudeCliProvider({ binary: "claude", id: "anthropic.custom" });
    expect(provider.id).toBe("anthropic.custom");
  });

  it("throws on missing binary path", () => {
    expect(() => createClaudeCliProvider({ binary: "" })).toThrow(/binary/i);
  });

  // Note: generateObject against a real `claude` binary is integration territory
  // and out of scope for unit tests. The base CLI driver covers the subprocess
  // protocol in Task 18 step 5 via a mock-binary script.
});
```

- [ ] **Step 3: Run tests — expect failure**

- [ ] **Step 4: Write the base + shim**

`packages/language/src/providers/cli/base.ts`:

```ts
import { execa } from "execa";
import type {
  GenerateObjectRequest,
  GenerateObjectResponse,
  ProviderAdapter,
} from "../types.js";

export interface CliProviderOptions {
  id: string;
  binary: string;
  /** Extra args to prepend to every invocation. */
  args?: string[];
  /** Lifecycle policy. v0 ships short-lived only. */
  lifecycle?: "short-lived";
  /** Timeout per call in milliseconds. */
  timeoutMs?: number;
}

export function createCliProvider(opts: CliProviderOptions): ProviderAdapter {
  if (!opts.binary) {
    throw new Error("CLI provider: binary path is required.");
  }
  return {
    id: opts.id,
    mode: "cli",
    async generateObject<T>(req: GenerateObjectRequest): Promise<GenerateObjectResponse<T>> {
      const payload = JSON.stringify({
        messages: req.messages,
        temperature: req.temperature,
        maxOutputTokens: req.maxOutputTokens,
        // The CLI is expected to know the schema by name; we hand it the
        // request envelope and trust the protocol.
      });
      const result = await execa(opts.binary, opts.args ?? [], {
        input: payload,
        timeout: opts.timeoutMs ?? 60_000,
        stripFinalNewline: true,
      });
      // CLI emits one JSON line on stdout. Parse it as the response value.
      let value: T;
      try {
        value = JSON.parse(result.stdout) as T;
      } catch (err) {
        throw new Error(
          `CLI provider \`${opts.id}\` returned non-JSON stdout: ${result.stdout.slice(0, 200)}`,
        );
      }
      return { value };
    },
  };
}
```

`packages/language/src/providers/cli/claude.ts`:

```ts
import { createCliProvider } from "./base.js";
import type { ProviderAdapter } from "../types.js";

export interface ClaudeCliOptions {
  binary: string;
  /** Optional id override; defaults to anthropic.claude_code. */
  id?: string;
  /** Optional extra args. */
  args?: string[];
}

export function createClaudeCliProvider(opts: ClaudeCliOptions): ProviderAdapter {
  return createCliProvider({
    id: opts.id ?? "anthropic.claude_code",
    binary: opts.binary,
    args: opts.args ?? ["--protocol", "claude-cli-jsonline-v1"],
    lifecycle: "short-lived",
  });
}
```

- [ ] **Step 5: Run tests — expect pass**

Expected: `3 passed`.

- [ ] **Step 6: Commit**

```bash
git add packages/language/src/providers/cli/base.ts \
        packages/language/src/providers/cli/claude.ts \
        packages/language/test/providers/cli/claude.test.ts \
        packages/language/package.json \
        pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(providers): CLI provider base + claude shim

Short-lived subprocess driver via execa: writes a JSON request to
stdin, expects one JSON line on stdout. claude shim presets the
canonical id and protocol flag. codex / gemini shims follow once
their CLI protocols are pinned (Phase 2 spec territory).

Adds execa@9 to deps.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 19: CLI provider integration test with mock binary

**Files:**
- Create: `packages/language/test/providers/cli/mock-binary.mjs` (executable)
- Create: `packages/language/test/providers/cli/cli-integration.test.ts`

- [ ] **Step 1: Write the mock binary**

`packages/language/test/providers/cli/mock-binary.mjs`:

```js
#!/usr/bin/env node
// Mock CLI provider binary. Reads JSON from stdin and emits a deterministic
// JSON response on stdout. Used to exercise the CLI subprocess protocol
// without depending on a real Claude / Codex install.

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const req = JSON.parse(input);
  const lastMessage = req.messages[req.messages.length - 1];
  const response = {
    echo: lastMessage.content,
    role: lastMessage.role,
    temperature: req.temperature ?? null,
  };
  process.stdout.write(JSON.stringify(response));
});
```

Mark executable:

```bash
chmod +x packages/language/test/providers/cli/mock-binary.mjs
```

(Windows note: execa launches `.mjs` directly via `node`; we set the shebang for cross-platform convenience but invoke via `process.execPath` in the test.)

- [ ] **Step 2: Write the failing test**

`packages/language/test/providers/cli/cli-integration.test.ts`:

```ts
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createCliProvider } from "../../../src/providers/cli/base.js";

const MOCK_BIN = fileURLToPath(new URL("./mock-binary.mjs", import.meta.url));

describe("CLI provider end-to-end with mock binary", () => {
  it("invokes the binary, sends JSON stdin, parses JSON stdout", async () => {
    const provider = createCliProvider({
      id: "mock.cli",
      binary: process.execPath, // node
      args: [MOCK_BIN],
    });
    const result = await provider.generateObject({
      messages: [{ role: "user", content: "ping" }],
      schema: {},
      temperature: 0.5,
    });
    expect(result.value).toEqual({ echo: "ping", role: "user", temperature: 0.5 });
  });

  it("throws when the binary returns non-JSON stdout", async () => {
    // Use a node one-liner that prints garbage.
    const provider = createCliProvider({
      id: "mock.cli.bad",
      binary: process.execPath,
      args: ["-e", "process.stdout.write('not json')"],
    });
    await expect(
      provider.generateObject({ messages: [{ role: "user", content: "x" }], schema: {} }),
    ).rejects.toThrow(/non-json/i);
  });
});
```

- [ ] **Step 3: Run tests — expect pass**

Expected: `2 passed`.

- [ ] **Step 4: Commit**

```bash
git add packages/language/test/providers/cli/mock-binary.mjs \
        packages/language/test/providers/cli/cli-integration.test.ts
git commit -m "$(cat <<'EOF'
test(providers): CLI base round-trips through a mock node binary

Proves the subprocess + stdio protocol works without depending on a
real Claude or Codex install. Mock binary echoes the last user
message back. Negative case asserts non-JSON stdout produces a typed
error.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase G — Pipeline orchestrator + corrections wiring (Tasks 20-22)

The pipeline ties dispatcher + parser + resolver + corrections into a single `runPipeline(source, ctx)` call that downstream callers (Izsha, `vibe build`) consume.

### Task 20: runPipeline — happy path with pure source (no resolver call)

**Files:**
- Create: `packages/language/src/pipeline/run.ts`
- Create: `packages/language/test/pipeline/pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/language/test/pipeline/pipeline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createProviderRegistry } from "../../src/providers/index.js";
import { runPipeline } from "../../src/pipeline/run.js";

describe("runPipeline — pure structured source", () => {
  it("parses pure-structured input with no resolver call", async () => {
    const registry = createProviderRegistry();
    const result = await runPipeline({
      source: `
        provider cerebras.glm_4_7 { mode = api }
        route resolver -> cerebras.glm_4_7
        persona izsha { description = "coordinator, dry" }
      `,
      registry,
      defaultResolver: { provider: "unused", model: "unused", temperature: 0 },
    });
    expect(result.shape).toBe("pure-structured");
    expect(result.parseErrors).toEqual([]);
    expect(result.resolvedRegions).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

- [ ] **Step 3: Write a minimal pipeline that handles the pure case only**

`packages/language/src/pipeline/run.ts`:

```ts
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { parseHelper } from "langium/test";
import { dispatchSource } from "../dispatcher/index.js";
import type { ResolverResult } from "../resolver/types.js";
import type { Project } from "../generated/ast.js";
import type { ProviderRegistry } from "../providers/index.js";
import { createVibeServices } from "../vibe-module.js";

export interface PipelineInput {
  source: string;
  registry: ProviderRegistry;
  defaultResolver: { provider: string; model: string; temperature: number };
}

export interface PipelineResult {
  shape: ReturnType<typeof dispatchSource>["shape"];
  parseErrors: string[];
  resolvedRegions: ResolverResult[];
  diagnostics: string[];
}

// One services container per process; safe to share across calls.
const services = createVibeServices(EmptyFileSystem).Vibe;
const parse = parseHelper<Project>(services);

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const stream = dispatchSource(input.source);

  const parseErrors: string[] = [];
  const resolvedRegions: ResolverResult[] = [];

  for (const region of stream.regions) {
    if (region.kind === "structured") {
      const document = await parse(region.text);
      const errs = document.parseResult.lexerErrors.concat(document.parseResult.parserErrors).map((e) => e.message);
      parseErrors.push(...errs);
      await services.shared.workspace.DocumentBuilder.build([document as LangiumDocument], { validation: true });
    } else {
      // Prose handling lands in Task 21.
    }
  }

  return {
    shape: stream.shape,
    parseErrors,
    resolvedRegions,
    diagnostics: [],
  };
}
```

- [ ] **Step 4: Run tests — expect pass**

Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/language/src/pipeline/run.ts \
        packages/language/test/pipeline/pipeline.test.ts
git commit -m "$(cat <<'EOF'
feat(pipeline): runPipeline skeleton handles pure-structured sources

Single entry point that consumers (Izsha, vibe build) will call.
Current scope: dispatch, parse + validate every structured region,
collect parse errors. Prose handling and corrections wire in next
tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 21: runPipeline — markdown source with prose region → resolver call

**Files:**
- Modify: `packages/language/src/pipeline/run.ts`
- Modify: `packages/language/test/pipeline/pipeline.test.ts` (append new describe)

- [ ] **Step 1: Add the failing test**

Append to `packages/language/test/pipeline/pipeline.test.ts`:

```ts
import { z } from "zod";
import { createMockProvider } from "../../src/providers/mock.js";

describe("runPipeline — markdown with prose", () => {
  it("dispatches structured to parser and prose to resolver", async () => {
    const provider = createMockProvider({
      id: "mock.api",
      response: { description: "coordinator, dry" },
    });
    const registry = createProviderRegistry();
    registry.register(provider);

    const result = await runPipeline({
      source: `# Izsha

We want a coordinator agent named Izsha.

\`\`\`vibe
provider cerebras.glm_4_7 { mode = api }
route resolver -> cerebras.glm_4_7
persona izsha { description = "placeholder" }
\`\`\`

She should sound terse.
`,
      registry,
      defaultResolver: { provider: "mock.api", model: "mock-m", temperature: 0.3 },
      proseSchema: z.object({ description: z.string() }),
    });

    expect(result.shape).toBe("markdown");
    expect(result.parseErrors).toEqual([]);
    expect(result.resolvedRegions.length).toBeGreaterThanOrEqual(2);
    expect(result.resolvedRegions[0].value).toEqual({ description: "coordinator, dry" });
  });
});
```

- [ ] **Step 2: Extend `runPipeline`**

Update `packages/language/src/pipeline/run.ts`:

```ts
import type { ZodTypeAny } from "zod";
import { resolveProse } from "../resolver/index.js";

export interface PipelineInput {
  source: string;
  registry: ProviderRegistry;
  defaultResolver: { provider: string; model: string; temperature: number };
  /** Schema used to shape every prose-region resolution. */
  proseSchema?: ZodTypeAny;
}

// ... inside runPipeline, replace the prose branch:
    } else {
      if (!input.proseSchema) continue; // pipeline configured to ignore prose
      const resolved = await resolveProse({
        region,
        context: {
          provider: input.defaultResolver.provider,
          model: input.defaultResolver.model,
          temperature: input.defaultResolver.temperature,
        },
        schema: input.proseSchema,
        registry: input.registry,
      });
      resolvedRegions.push(resolved);
    }
```

- [ ] **Step 3: Run tests — expect pass**

Expected: `2 passed` total in the pipeline file.

- [ ] **Step 4: Commit**

```bash
git add packages/language/src/pipeline/run.ts \
        packages/language/test/pipeline/pipeline.test.ts
git commit -m "$(cat <<'EOF'
feat(pipeline): prose regions in markdown sources flow to resolver

Adds a proseSchema option. When set, every prose region in the
dispatched stream is resolved via the registered provider and the
result is appended to resolvedRegions. Sources without a proseSchema
silently skip prose - useful for vibe build passes that only care
about structured output.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 22: runPipeline — apply `corrected` blocks to resolver outputs

**Files:**
- Modify: `packages/language/src/pipeline/run.ts` (extract corrected blocks from parsed AST and feed mergeCorrected)
- Modify: `packages/language/test/pipeline/pipeline.test.ts` (new describe)

- [ ] **Step 1: Add the failing test**

Append to `packages/language/test/pipeline/pipeline.test.ts`:

```ts
describe("runPipeline — corrected blocks override resolver output", () => {
  it("applies a corrected block to a tagged resolver region", async () => {
    const provider = createMockProvider({
      id: "mock.api",
      response: { description: "LLM original" },
    });
    const registry = createProviderRegistry();
    registry.register(provider);

    const result = await runPipeline({
      source: `# Izsha

We want a coordinator agent.

\`\`\`vibe-prose#tag1
We want a coordinator agent.
\`\`\`

\`\`\`vibe
provider cerebras.glm_4_7 { mode = api }
route resolver -> cerebras.glm_4_7

corrected for "tag1" {
  description = "human override"
}
\`\`\`
`,
      registry,
      defaultResolver: { provider: "mock.api", model: "mock-m", temperature: 0.3 },
      proseSchema: z.object({ description: z.string() }),
    });

    expect(result.resolvedRegions.length).toBeGreaterThan(0);
    expect(result.mergedRegions).toBeDefined();
    expect(result.mergedRegions[0].value).toEqual({ description: "human override" });
    expect(result.mergedRegions[0].overrides).toEqual(["description"]);
  });
});
```

- [ ] **Step 2: Extend the pipeline**

Add the corrections-merge step at the end of `runPipeline`:

```ts
import { mergeCorrected } from "../resolver/corrections.js";

// Add to PipelineResult:
export interface PipelineResult {
  // ...existing fields
  mergedRegions: Array<{
    value: unknown;
    overrides: string[];
    unknownKeys: string[];
    cacheKey: string;
  }>;
}

// At the end of runPipeline, before the return:
const correctedByTag = collectCorrectedBlocks(parsedDocuments);
const mergedRegions = resolvedRegions.map((res) => {
  // Wire the cacheKey / tag association: SD2 uses the resolver's cacheKey
  // (or an explicit region.tag if the source set ```vibe-prose#tagN) as
  // the lookup. v0 reads region.tag when present; otherwise the first
  // resolved region matches the first corrected block, etc.
  const tag = res.cacheKey.slice(0, 12); // truncate for readability in errors
  const corrected = correctedByTag.get(tag);
  const merge = mergeCorrected({ resolved: res.value as object, corrected });
  return {
    value: merge.value,
    overrides: merge.overrides,
    unknownKeys: merge.unknownKeys,
    cacheKey: res.cacheKey,
  };
});
```

Implement `collectCorrectedBlocks(parsedDocuments)` as a helper that walks each parsed `Project` and gathers `Corrected` nodes by their `target` string.

- [ ] **Step 3: Run tests — expect pass**

Expected: pipeline file 3 passed.

- [ ] **Step 4: Commit**

```bash
git add packages/language/src/pipeline/run.ts \
        packages/language/test/pipeline/pipeline.test.ts
git commit -m "$(cat <<'EOF'
feat(pipeline): merge adjacent corrected blocks with resolver outputs

runPipeline now collects every `corrected for "tag"` declaration from
parsed structured regions, then applies them as shallow per-key
overrides to the matching resolver outputs. Override + unknown-key
records surface to the caller so variance metadata can include human
edits as a first-class provenance source.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase H — Example file + integration test (Tasks 23-24)

The 9 SD1 examples remain valid. SD2 adds one new example covering the resolver flow.

### Task 23: examples/10-resolver-flow.vibe

**Files:**
- Create: `examples/10-resolver-flow.vibe`

- [ ] **Step 1: Author the example**

`examples/10-resolver-flow.vibe`:

````markdown
# Izsha Sketch

We want a coordinator agent that owns the asset pipeline. She should be terse
and prefer concrete plans over speculation.

```vibe-prose#izsha-sketch
We want a coordinator agent that owns the asset pipeline. She should be terse
and prefer concrete plans over speculation.
```

```vibe
provider cerebras.glm_4_7 { mode = api }
route resolver -> cerebras.glm_4_7

persona izsha {
  description = "placeholder — resolver fills this in"
}

agent izsha {
  persona = persona.izsha
  uses = [plugin.asset_pipeline]
}

plugin asset_pipeline {
  impl = "./plugins/asset-pipeline.ts"
}

corrected for "izsha-sketch" {
  description = "coordinator, dry"
}
```
````

- [ ] **Step 2: Verify it parses through the dispatcher + parser**

Run a quick probe in a scratch file (don't commit):

```bash
pnpm --filter @vibe/language test test/integration/canonical-project.test.ts
```

The existing integration test should pass against `examples/01-provider.vibe` through `09-project.vibe` AND `10-resolver-flow.vibe` once Task 24 extends it.

- [ ] **Step 3: Commit**

```bash
git add examples/10-resolver-flow.vibe
git commit -m "$(cat <<'EOF'
examples: 10-resolver-flow demonstrates prose → resolver → corrected

First markdown-shaped example. Shows the canonical SD2 surface: a
prose region tagged with a resolver target, a structured block that
defines the schema scaffold, and an adjacent corrected block that
overrides one resolved field. End-to-end pipeline regression target.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 24: SD2 integration test — every example file flows through runPipeline

**Files:**
- Modify: `packages/language/test/integration/canonical-project.test.ts` (extend to cover 10-resolver-flow with mock provider)

- [ ] **Step 1: Add the failing test case**

Append a new `it()` to the existing integration file:

```ts
import { createMockProvider } from "../../src/providers/mock.js";
import { createProviderRegistry } from "../../src/providers/index.js";
import { runPipeline } from "../../src/pipeline/run.js";
import { z } from "zod";

it("10-resolver-flow.vibe flows through runPipeline cleanly", async () => {
  const text = await readFile(`${EXAMPLES_DIR}10-resolver-flow.vibe`, "utf8");
  const provider = createMockProvider({
    id: "cerebras.glm_4_7",
    response: { description: "coordinator, dry" },
  });
  const registry = createProviderRegistry();
  registry.register(provider);

  const result = await runPipeline({
    source: text,
    registry,
    defaultResolver: { provider: "cerebras.glm_4_7", model: "zai-glm-4.7", temperature: 0.3 },
    proseSchema: z.object({ description: z.string() }),
  });

  expect(result.parseErrors).toEqual([]);
  expect(result.resolvedRegions.length).toBeGreaterThan(0);
  // The corrected block should override the resolved description.
  expect(result.mergedRegions[0].value).toEqual({ description: "coordinator, dry" });
});
```

- [ ] **Step 2: Run tests — expect pass**

Expected: integration file 11 passed (9 existing + 1 guardrail + 1 new resolver-flow).

- [ ] **Step 3: Commit**

```bash
git add packages/language/test/integration/canonical-project.test.ts
git commit -m "$(cat <<'EOF'
test(integration): 10-resolver-flow.vibe rides runPipeline end-to-end

Extends the canonical example sweep to cover the new SD2 markdown
example. Uses a mock provider so the test is deterministic and runs
in CI without API credentials.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase I — Surface + README (Tasks 25-26)

### Task 25: Re-export the SD2 public API

**Files:**
- Modify: `packages/language/src/index.ts`

- [ ] **Step 1: Update the package barrel**

`packages/language/src/index.ts` should re-export:

```ts
export * from "./generated/ast.js";
export { createVibeServices, VibeModule } from "./vibe-module.js";
export { registerValidationChecks } from "./vibe-validator.js";

// SD2 surface
export {
  dispatchSource,
  detectShape,
  type Region,
  type RegionKind,
  type RegionStream,
  type ProseRegion,
  type StructuredRegion,
  type SourceShape,
} from "./dispatcher/index.js";

export {
  resolveProse,
  createInMemoryCache,
  computeCacheKey,
  makeVariance,
  formatVariance,
  type ResolverContext,
  type ResolverResult,
  type Variance,
  type PrimitivesSummary,
} from "./resolver/index.js";

export {
  createProviderRegistry,
  createMockProvider,
  type ProviderAdapter,
  type ProviderMode,
  type ChatMessage,
  type ChatRole,
  type GenerateObjectRequest,
  type GenerateObjectResponse,
} from "./providers/index.js";

export { createCerebrasProvider } from "./providers/api/cerebras.js";
export { createClaudeCliProvider } from "./providers/cli/claude.js";
export { mergeCorrected } from "./resolver/corrections.js";
export { runPipeline, type PipelineInput, type PipelineResult } from "./pipeline/run.js";
```

- [ ] **Step 2: Run the build + full test suite**

```bash
pnpm --filter @vibe/language build
pnpm --filter @vibe/language test
```

Expected: build clean, 220+ tests passing.

- [ ] **Step 3: Commit**

```bash
git add packages/language/src/index.ts
git commit -m "$(cat <<'EOF'
chore(language): re-export SD2 public surface from package barrel

One-stop import for consumers: dispatcher, resolver, providers,
pipeline, corrections. Internal types stay internal.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 26: README + final lint + LSP sanity

**Files:**
- Modify: `packages/language/README.md`

- [ ] **Step 1: Update README**

Replace the existing README content with one that documents the SD2 surface in addition to SD1:

```markdown
# @vibe/language

Vibe is a hybrid specification language for vibecoded ecosystems. This package
ships the SD1 + SD2 surface: parser, AST, validators, file-shape dispatcher,
LLM resolver, and provider adapters.

## Status

- **SD1 (Language layer):** 9 primitives (agent, route, fallback, persona,
  provider, memory, harness, plugin, trigger) plus the SD2 `corrected`
  declaration. 3 validators (duplicate-declarations, required-resolver-route,
  cross-reference-resolution, corrected-target).
- **SD2 (Dispatcher + Resolver):** file-shape dispatcher slices `.vibe` source
  into structured + prose regions. Resolver wraps a pluggable ProviderAdapter
  with content-addressed cache + Zod schema validation + variance metadata.
  Adjacent `corrected for "tag"` blocks override resolver outputs per-key.
- **Provider adapters:** Cerebras via @ai-sdk/openai-compatible (default for
  resolver). claude CLI shim via execa. codex / gemini shims follow in Phase 2.
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
  createCerebrasProvider,
  createProviderRegistry,
  runPipeline,
} from "@vibe/language";
import { z } from "zod";

const registry = createProviderRegistry();
registry.register(createCerebrasProvider({
  apiKey: process.env.CEREBRAS_API_KEY!,
  baseUrl: "https://api.cerebras.ai/v1",
  model: "zai-glm-4.7",
}));

const result = await runPipeline({
  source: await readFile("project.vibe", "utf8"),
  registry,
  defaultResolver: { provider: "cerebras.zai-glm-4.7", model: "zai-glm-4.7", temperature: 0.3 },
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
```

- [ ] **Step 2: Run final build + test + LSP smoke**

```bash
pnpm --filter @vibe/language build
pnpm --filter @vibe/language test
node packages/language/scripts/lsp-smoke.mjs
```

All three exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/language/README.md
git commit -m "$(cat <<'EOF'
docs(language): README documents the SD2 surface

Adds dispatcher + resolver + providers + pipeline to the
documentation. Includes a minimal usage snippet showing how to wire
Cerebras and run a markdown source end-to-end.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Definition of done

Before merging `feat/sd2-resolver` to `main`:

- [ ] `pnpm --filter @vibe/language test` reports **220+ passing** (160 SD1 + ~60 SD2). No skipped, no failing.
- [ ] `pnpm --filter @vibe/language build` exits 0.
- [ ] `pnpm --filter vibe-vscode build` exits 0.
- [ ] `node packages/language/scripts/lsp-smoke.mjs` boots the LSP and prints 17+ capabilities.
- [ ] The 9 SD1 example files (`examples/01-provider.vibe` through `09-project.vibe`) still parse + validate clean.
- [ ] `examples/10-resolver-flow.vibe` rides `runPipeline` cleanly with a mock provider.
- [ ] No new files committed under `packages/language/src/generated/` or `packages/vscode-extension/syntaxes/vibe.tmLanguage.json`.
- [ ] No new dependencies added beyond: `unified`, `remark-parse`, `zod`, `ai`, `@ai-sdk/openai-compatible`, `execa`. Each anchored to a major version in `package.json`.
- [ ] Final whole-SD2 code review via `feature-dev:code-reviewer` returns `SD2_COMPLETE` or `SD2_COMPLETE_WITH_NOTES`.
- [ ] All review action items addressed.
- [ ] `superpowers:finishing-a-development-branch` invoked, Option 1 (merge locally) executed.

---

## Out of scope (SD3 / SD4 / SD5)

- **`vibe init`** — repo analysis pipeline that emits the `.vibe/` Obsidian vault. SD3.
- **`vibe sync`** — re-runs analysis after repo changes, diffs vault notes. SD3.
- **`vibe build`** — compiles `.vibe` source into provider artifacts (AGENTS.md, .claude/, .codex/, .mcp.json). SD3 / SD5 split.
- **VS Code LSP hover-preview** — hover over a prose region, popup shows resolver output + variance. SD4.
- **VS Code `.vibe/` tree view, command palette wiring** — SD4.
- **codex + gemini CLI shims** — Phase 2 spec territory; protocols not yet pinned.
- **Long-lived CLI lifecycle** — SD2 ships short-lived only. Long-lived process management (crash detection, context-window management, restart policy) follows.
- **Cross-language plugin FFI** — Python plugins via HTTP, Rust plugins via NAPI. Phase 4+.

---

*End of SD2 plan. See SD1 plan at `docs/superpowers/plans/2026-05-13-vibe-v0-sd1-language.md` for the orchestration template SD2 follows.*
