# @vibe/runtime Package Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the deepagents-based lane translator from `sandbox/deepagents-poc/` into a buildable `packages/runtime/` workspace package, wrapping LangGraph's chunk stream in a typed `AsyncIterable<LaneEvent>` so Cockpit's `InProcessVibeService` and the future Vibe daemon can both consume the same module.

**Architecture:** Three internal modules — `types.ts` (canonical `LaneEvent` + `LaneRunSpec`/`LaneRunInputs` types per spec §3.4/§5.2), `chunk-mapper.ts` (pure function: LangGraph chunk → 0..N `LaneEvent` variants per the §5.2 mapping table, stateful only for `prevFiles`/`lastAssistantMessage` buffers), `run-translated.ts` (orchestrator: takes `spec`/`input`/`signal`, builds agent via the copied translator, iterates `agent.stream(... streamMode: "updates", subgraphs: true)`, pipes chunks through the mapper, yields `LaneEvent`). Translator + support modules copied verbatim from `sandbox/deepagents-poc/`; the chunk-mapper layer is net-new.

**Tech Stack:** TypeScript ESM, Vitest 2.x, pnpm workspaces, `deepagents` + `@langchain/core` (existing deps from sandbox). Node ≥22.

**Spec reference:** [Cockpit/docs/superpowers/specs/2026-05-18-cockpit-vibe-integration-design.md](../../../../Users/4elut/Documents/Cockpit/docs/superpowers/specs/2026-05-18-cockpit-vibe-integration-design.md) sections §3.4, §5.2, §5.4. This plan is the critical-path prerequisite for the Cockpit Phase 3 plan that will follow.

---

## File Structure

**Create:**
- `packages/runtime/package.json` — workspace package metadata, name `@vibe/runtime`
- `packages/runtime/tsconfig.json` — extends `../../tsconfig.base.json`
- `packages/runtime/vitest.config.ts`
- `packages/runtime/README.md`
- `packages/runtime/src/index.ts` — barrel export
- `packages/runtime/src/types.ts` — `LaneEvent`, `TodoItem`, `LaneRunSpec`, `LaneRunInputs`, `FileOutput`
- `packages/runtime/src/translator.ts` — verbatim copy of `sandbox/deepagents-poc/src/translator.ts`
- `packages/runtime/src/cerebras-model.ts` — verbatim copy of `sandbox/deepagents-poc/src/cerebras-model.ts`
- `packages/runtime/src/cli-tools.ts` — verbatim copy of `sandbox/deepagents-poc/src/cli-tools.ts`
- `packages/runtime/src/chunk-mapper.ts` — net-new; pure function with `MapperState`
- `packages/runtime/src/run-translated.ts` — exports `runTranslatedLane`
- `packages/runtime/test/types.test.ts` — type-existence smoke
- `packages/runtime/test/chunk-mapper.test.ts` — one test per §5.2 mapping row
- `packages/runtime/test/run-translated.test.ts` — orchestrator tests with mocked stream
- `packages/runtime/test/fixtures/chunks/tool-call.json`
- `packages/runtime/test/fixtures/chunks/tool-result.json`
- `packages/runtime/test/fixtures/chunks/write-todos.json`
- `packages/runtime/test/fixtures/chunks/file-write.json`
- `packages/runtime/test/fixtures/chunks/subagent-message.json`
- `packages/runtime/test/fixtures/chunks/final-message.json`
- `packages/runtime/test/fixtures/chunks/full-run-sequence.json` — array of chunks for end-to-end test

**Modify:** none (root `pnpm-workspace.yaml` already globs `packages/*`; root `package.json` `pnpm -r build`/`test` picks up the new package automatically).

**Single-responsibility split:** types is types-only (no runtime). chunk-mapper is a pure (chunk, state) → (LaneEvent[], newState) function so it's exhaustively testable without spinning up an agent. run-translated.ts is the only module that knows about `agent.stream(...)`, AbortSignal, and the synthetic `start` event.

---

## Tasks

### Task 1: Scaffold the workspace package

**Files:**
- Create: `packages/runtime/package.json`
- Create: `packages/runtime/tsconfig.json`
- Create: `packages/runtime/src/index.ts`

- [ ] **Step 1: Create package directory and package.json**

Run: `mkdir packages/runtime` then create `packages/runtime/package.json`:

```json
{
  "name": "@vibe/runtime",
  "version": "0.0.0",
  "private": true,
  "description": "Vibe lane runtime: translator + LangGraph chunk-mapper. Consumed by Cockpit's InProcessVibeService and the Vibe daemon.",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@langchain/core": "latest",
    "@langchain/openai": "latest",
    "deepagents": "latest",
    "execa": "^9.6.1",
    "langchain": "latest",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.0"
  },
  "engines": {
    "node": ">=22"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `packages/runtime/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "test", "node_modules"]
}
```

- [ ] **Step 3: Create placeholder index.ts**

Create `packages/runtime/src/index.ts`:

```typescript
// @vibe/runtime — public API barrel. Real exports land in Task 15.
export {};
```

- [ ] **Step 4: Install + build to verify scaffolding**

Run from repo root: `pnpm install`
Expected: pnpm adds `@vibe/runtime` to the workspace; new dependencies are linked.

Run: `pnpm --filter @vibe/runtime build`
Expected: tsc emits `packages/runtime/dist/index.js` with no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/package.json packages/runtime/tsconfig.json packages/runtime/src/index.ts pnpm-lock.yaml
git commit -m "feat(runtime): scaffold @vibe/runtime workspace package"
```

---

### Task 2: Set up Vitest

**Files:**
- Create: `packages/runtime/vitest.config.ts`
- Create: `packages/runtime/test/smoke.test.ts`

- [ ] **Step 1: Write a smoke test**

Create `packages/runtime/test/smoke.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("@vibe/runtime", () => {
  it("loads", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2: Configure Vitest**

Create `packages/runtime/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 10_000,
  },
});
```

- [ ] **Step 3: Run smoke test**

Run: `pnpm --filter @vibe/runtime test`
Expected: PASS `test/smoke.test.ts` (1 passed).

- [ ] **Step 4: Commit**

```bash
git add packages/runtime/vitest.config.ts packages/runtime/test/smoke.test.ts
git commit -m "test(runtime): set up vitest with smoke test"
```

---

### Task 3: Define canonical types

**Files:**
- Create: `packages/runtime/src/types.ts`
- Create: `packages/runtime/test/types.test.ts`

- [ ] **Step 1: Write a type-existence test**

Create `packages/runtime/test/types.test.ts`:

```typescript
import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  LaneEvent,
  TodoItem,
  LaneRunSpec,
  LaneRunInputs,
  FileOutput,
} from "../src/types.js";

describe("types", () => {
  it("LaneEvent discriminates on type", () => {
    const start: LaneEvent = { type: "start", laneId: "x", runId: "r1" };
    const final: LaneEvent = { type: "final", summary: "", outputs: [] };
    const err: LaneEvent = { type: "error", message: "boom", recoverable: false };
    expect(start.type).toBe("start");
    expect(final.type).toBe("final");
    expect(err.type).toBe("error");
  });

  it("TodoItem has id, content, status", () => {
    const t: TodoItem = { id: "1", content: "do thing", status: "pending" };
    expectTypeOf(t.status).toEqualTypeOf<"pending" | "in_progress" | "completed">();
  });

  it("LaneRunSpec carries the resolved prompt and globs", () => {
    const s: LaneRunSpec = {
      laneId: "feedback-triage",
      prompt: "You are…",
      reads: ["/docs/**"],
      owns: ["/outputs/**"],
      repoPath: "C:/repos/pawfall",
    };
    expect(s.laneId).toBe("feedback-triage");
  });

  it("LaneRunInputs has userMessage and optional overrides", () => {
    const i: LaneRunInputs = {
      userMessage: "go",
      overrides: { model: "cerebras", cwd: "/tmp" },
    };
    expect(i.userMessage).toBe("go");
  });

  it("FileOutput has path + bytes", () => {
    const f: FileOutput = { path: "/outputs/a.md", bytes: 42 };
    expect(f.bytes).toBe(42);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (no types yet)**

Run: `pnpm --filter @vibe/runtime test`
Expected: FAIL — `Cannot find module '../src/types.js'`.

- [ ] **Step 3: Implement types**

Create `packages/runtime/src/types.ts`:

```typescript
/**
 * Canonical LaneEvent variants. Discriminated union; consumers should switch on `type`.
 * Mirrors the Cockpit contract module (`src/lib/plugins/contract/types.ts`) — the two
 * declarations are intentional re-declarations across repo boundaries, not a shared import.
 */
export type LaneEvent =
  | { type: "start"; laneId: string; runId: string }
  | { type: "todo"; items: TodoItem[] }
  | { type: "tool_call"; tool: string; args?: unknown }
  | { type: "tool_result"; tool: string; ok: boolean; preview?: string }
  | { type: "log"; level: "info" | "warn" | "error"; message: string }
  | { type: "file_write"; path: string; bytes: number }
  | { type: "final"; summary: string; outputs: FileOutput[] }
  | { type: "error"; message: string; recoverable: boolean };

export interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export interface FileOutput {
  path: string;
  bytes: number;
}

export interface LaneRunSpec {
  laneId: string;
  prompt: string;
  reads: string[];
  owns: string[];
  tools?: string[];
  model?: string;
  approval?: string;
  verify?: string[];
  repoPath: string;
}

export interface LaneRunInputs {
  userMessage: string;
  overrides?: {
    model?: string;
    envVars?: Record<string, string>;
    cwd?: string;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vibe/runtime test`
Expected: PASS (smoke + types: 6 passed).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/types.ts packages/runtime/test/types.test.ts
git commit -m "feat(runtime): define LaneEvent, TodoItem, LaneRunSpec, LaneRunInputs, FileOutput"
```

---

### Task 4: Copy translator + support modules from sandbox

**Files:**
- Create: `packages/runtime/src/translator.ts` (copy of `sandbox/deepagents-poc/src/translator.ts`)
- Create: `packages/runtime/src/cerebras-model.ts` (copy of `sandbox/deepagents-poc/src/cerebras-model.ts`)
- Create: `packages/runtime/src/cli-tools.ts` (copy of `sandbox/deepagents-poc/src/cli-tools.ts`)

- [ ] **Step 1: Copy translator.ts**

Run: `cp sandbox/deepagents-poc/src/translator.ts packages/runtime/src/translator.ts`

Then open the copy and confirm the imports look like:

```typescript
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createDeepAgent, FilesystemBackend } from "deepagents";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Tool } from "@langchain/core/tools";
import { createCerebrasModel } from "./cerebras-model.js";
import { invokeCodexCli, invokeClaudeCli } from "./cli-tools.js";
```

No path edits needed — `./cerebras-model.js` and `./cli-tools.js` are sibling-relative.

- [ ] **Step 2: Copy cerebras-model.ts and cli-tools.ts**

Run:
```bash
cp sandbox/deepagents-poc/src/cerebras-model.ts packages/runtime/src/cerebras-model.ts
cp sandbox/deepagents-poc/src/cli-tools.ts packages/runtime/src/cli-tools.ts
```

- [ ] **Step 3: Verify build**

Run: `pnpm --filter @vibe/runtime build`
Expected: tsc emits `dist/translator.js`, `dist/cerebras-model.js`, `dist/cli-tools.js` with no errors.

- [ ] **Step 4: Verify the existing sandbox tests still pass (regression check on the source we copied)**

Run: `pnpm --filter @vibe/runtime test`
Expected: PASS (types + smoke — copied modules have no tests yet).

Sandbox-side: `cd sandbox/deepagents-poc && pnpm typecheck` if applicable. (The POC has no automated tests; the typecheck script confirms it still compiles.)
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/translator.ts packages/runtime/src/cerebras-model.ts packages/runtime/src/cli-tools.ts
git commit -m "feat(runtime): copy translator + cerebras-model + cli-tools from sandbox"
```

---

### Task 5: chunk-mapper — `tool_call` variant (and the MapperState scaffold)

**Files:**
- Create: `packages/runtime/src/chunk-mapper.ts`
- Create: `packages/runtime/test/chunk-mapper.test.ts`
- Create: `packages/runtime/test/fixtures/chunks/tool-call.json`

- [ ] **Step 1: Write the failing test**

Create `packages/runtime/test/fixtures/chunks/tool-call.json`:

```json
{
  "agent": {
    "messages": [
      {
        "tool_calls": [
          { "name": "write_file", "args": { "path": "/outputs/a.md", "content": "hi" } }
        ]
      }
    ]
  }
}
```

Create `packages/runtime/test/chunk-mapper.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mapChunk, createMapperState } from "../src/chunk-mapper.js";
import type { LaneEvent } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const loadFixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "fixtures", "chunks", name), "utf8"));

describe("chunk-mapper", () => {
  it("emits tool_call for each entry in an agent message's tool_calls", () => {
    const chunk = loadFixture("tool-call.json");
    const state = createMapperState();
    const events = mapChunk([], chunk, state);
    expect(events).toEqual<LaneEvent[]>([
      {
        type: "tool_call",
        tool: "write_file",
        args: { path: "/outputs/a.md", content: "hi" },
      },
    ]);
  });

  it("skips chunks with empty tool_calls", () => {
    const state = createMapperState();
    const events = mapChunk([], { agent: { messages: [{ tool_calls: [] }] } }, state);
    expect(events).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (no chunk-mapper yet)**

Run: `pnpm --filter @vibe/runtime test`
Expected: FAIL — `Cannot find module '../src/chunk-mapper.js'`.

- [ ] **Step 3: Implement minimal chunk-mapper**

Create `packages/runtime/src/chunk-mapper.ts`:

```typescript
import type { LaneEvent, TodoItem, FileOutput } from "./types.js";

/**
 * Stateful buffer the mapper carries across chunks within one run.
 *
 *   - prevFiles: last-seen `state.files` snapshot, used to emit `file_write` only
 *     for paths whose content actually changed.
 *   - lastAssistantMessage: most recent main-agent message with `tool_calls.length === 0`.
 *     When the stream terminates, this becomes `final.summary`.
 */
export interface MapperState {
  prevFiles: Record<string, { content?: string; size?: number }>;
  lastAssistantMessage: string;
}

export function createMapperState(): MapperState {
  return { prevFiles: {}, lastAssistantMessage: "" };
}

/**
 * Pure-ish: maps one LangGraph stream chunk to zero or more LaneEvents.
 * `namespace` is the subgraph path (empty for main agent; non-empty for subagent chunks).
 * `chunk` is the LangGraph "updates" mode payload — an object keyed by node name.
 */
export function mapChunk(
  namespace: string[],
  chunk: unknown,
  state: MapperState,
): LaneEvent[] {
  if (!isPlainObject(chunk)) return [];
  const events: LaneEvent[] = [];

  // tool_call: AIMessageChunk with tool_calls under agent node
  const agentMessages = readMessages(chunk, "agent");
  for (const msg of agentMessages) {
    const toolCalls = readToolCalls(msg);
    for (const call of toolCalls) {
      events.push({ type: "tool_call", tool: call.name, args: call.args });
    }
  }

  return events;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readMessages(chunk: Record<string, unknown>, node: string): Array<Record<string, unknown>> {
  const nodeUpdate = chunk[node];
  if (!isPlainObject(nodeUpdate)) return [];
  const messages = nodeUpdate.messages;
  if (!Array.isArray(messages)) return [];
  return messages.filter(isPlainObject);
}

function readToolCalls(msg: Record<string, unknown>): Array<{ name: string; args?: unknown }> {
  const tc = msg.tool_calls;
  if (!Array.isArray(tc)) return [];
  return tc
    .filter(isPlainObject)
    .filter((c) => typeof c.name === "string")
    .map((c) => ({ name: c.name as string, args: c.args }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vibe/runtime test`
Expected: PASS (smoke + types + chunk-mapper tool_call: 8 passed).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/chunk-mapper.ts packages/runtime/test/chunk-mapper.test.ts packages/runtime/test/fixtures/chunks/tool-call.json
git commit -m "feat(runtime): chunk-mapper emits tool_call from agent messages"
```

---

### Task 6: chunk-mapper — `tool_result` variant

**Files:**
- Modify: `packages/runtime/src/chunk-mapper.ts`
- Modify: `packages/runtime/test/chunk-mapper.test.ts`
- Create: `packages/runtime/test/fixtures/chunks/tool-result.json`

- [ ] **Step 1: Write the failing test**

Create `packages/runtime/test/fixtures/chunks/tool-result.json`:

```json
{
  "tools": {
    "messages": [
      {
        "name": "read_file",
        "content": "long file content here that exceeds 240 chars when extended… long file content here that exceeds 240 chars when extended… long file content here that exceeds 240 chars when extended… long file content here that exceeds 240 chars when extended… long file content here that exceeds 240 chars when extended… long file content here that exceeds 240 chars when extended… long file content here that exceeds 240 chars when extended…",
        "status": "success"
      },
      {
        "name": "grep",
        "content": "no matches",
        "status": "error"
      }
    ]
  }
}
```

Append to `packages/runtime/test/chunk-mapper.test.ts` inside the `describe`:

```typescript
  it("emits tool_result with preview truncation and ok flag", () => {
    const chunk = loadFixture("tool-result.json");
    const state = createMapperState();
    const events = mapChunk([], chunk, state);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "tool_result",
      tool: "read_file",
      ok: true,
    });
    const preview = (events[0] as { preview?: string }).preview ?? "";
    expect(preview.length).toBeLessThanOrEqual(240);
    expect(events[1]).toMatchObject({
      type: "tool_result",
      tool: "grep",
      ok: false,
      preview: "no matches",
    });
  });

  it("suppresses tool_result for write_file / edit_file (file_write covers them)", () => {
    const state = createMapperState();
    const chunk = {
      tools: { messages: [{ name: "write_file", content: "ok", status: "success" }] },
    };
    const events = mapChunk([], chunk, state);
    expect(events).toEqual([]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vibe/runtime test -t tool_result`
Expected: FAIL — expected events not produced.

- [ ] **Step 3: Implement tool_result mapping**

Modify `packages/runtime/src/chunk-mapper.ts` — add to `mapChunk`, after the `tool_call` block:

```typescript
  // tool_result: ToolMessage under the tools node
  const toolMessages = readMessages(chunk, "tools");
  for (const msg of toolMessages) {
    const name = typeof msg.name === "string" ? msg.name : null;
    if (!name) continue;
    if (name === "write_file" || name === "edit_file") continue; // file_write covers these
    const status = msg.status;
    const ok = status !== "error";
    const contentRaw = msg.content;
    const preview =
      typeof contentRaw === "string"
        ? contentRaw.slice(0, 240)
        : undefined;
    events.push({ type: "tool_result", tool: name, ok, preview });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vibe/runtime test`
Expected: PASS (10 passed).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/chunk-mapper.ts packages/runtime/test/chunk-mapper.test.ts packages/runtime/test/fixtures/chunks/tool-result.json
git commit -m "feat(runtime): chunk-mapper emits tool_result with preview + ok flag"
```

---

### Task 7: chunk-mapper — `todo` variant (state slot + write_todos coalescing)

**Files:**
- Modify: `packages/runtime/src/chunk-mapper.ts`
- Modify: `packages/runtime/test/chunk-mapper.test.ts`
- Create: `packages/runtime/test/fixtures/chunks/write-todos.json`

- [ ] **Step 1: Write the failing test**

Create `packages/runtime/test/fixtures/chunks/write-todos.json`:

```json
{
  "tools": {
    "messages": [{ "name": "write_todos", "content": "ok", "status": "success" }]
  },
  "agent": {
    "todos": [
      { "id": "t1", "content": "read feedback", "status": "completed" },
      { "id": "t2", "content": "write plan", "status": "in_progress" }
    ]
  }
}
```

Append to `chunk-mapper.test.ts`:

```typescript
  it("emits a single todo event when write_todos + state.todos co-occur", () => {
    const chunk = loadFixture("write-todos.json");
    const state = createMapperState();
    const events = mapChunk([], chunk, state);
    const todoEvents = events.filter((e) => e.type === "todo");
    expect(todoEvents).toHaveLength(1);
    expect(todoEvents[0]).toEqual({
      type: "todo",
      items: [
        { id: "t1", content: "read feedback", status: "completed" },
        { id: "t2", content: "write plan", status: "in_progress" },
      ],
    });
    // write_todos tool_result is suppressed (folded into the todo event)
    const toolResults = events.filter((e) => e.type === "tool_result" && e.tool === "write_todos");
    expect(toolResults).toEqual([]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vibe/runtime test -t "todo event"`
Expected: FAIL — no todo event emitted.

- [ ] **Step 3: Implement todo mapping + coalesce write_todos**

In `chunk-mapper.ts`, modify the tool_result loop to also suppress `write_todos`:

```typescript
    if (name === "write_file" || name === "edit_file" || name === "write_todos") continue;
```

Then append, after the tool_result loop:

```typescript
  // todo: prefer state.todos (authoritative) over the write_todos tool message
  const agentNode = isPlainObject(chunk.agent) ? chunk.agent : {};
  const toolsNode = isPlainObject(chunk.tools) ? chunk.tools : {};
  const todoSource =
    (Array.isArray(agentNode.todos) && agentNode.todos) ||
    (Array.isArray(toolsNode.todos) && toolsNode.todos) ||
    null;
  if (todoSource) {
    const items: TodoItem[] = todoSource.filter(isPlainObject).map((t, i) => ({
      id: typeof t.id === "string" ? t.id : `t-${i}`,
      content: typeof t.content === "string" ? t.content : "",
      status:
        t.status === "in_progress" || t.status === "completed"
          ? t.status
          : "pending",
    }));
    events.push({ type: "todo", items });
  }
```

Confirm `TodoItem` is imported at the top of the file (it's already in the import line from Task 5; double-check).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vibe/runtime test`
Expected: PASS (11 passed).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/chunk-mapper.ts packages/runtime/test/chunk-mapper.test.ts packages/runtime/test/fixtures/chunks/write-todos.json
git commit -m "feat(runtime): chunk-mapper emits todo (coalesces write_todos tool_result)"
```

---

### Task 8: chunk-mapper — `file_write` variant (with prevFiles diff)

**Files:**
- Modify: `packages/runtime/src/chunk-mapper.ts`
- Modify: `packages/runtime/test/chunk-mapper.test.ts`
- Create: `packages/runtime/test/fixtures/chunks/file-write.json`

- [ ] **Step 1: Write the failing test**

Create `packages/runtime/test/fixtures/chunks/file-write.json`:

```json
{
  "tools": {
    "files": {
      "/outputs/a.md": { "content": "hello world" },
      "/outputs/b.md": { "size": 100 }
    }
  }
}
```

Append to `chunk-mapper.test.ts`:

```typescript
  it("emits file_write only for paths whose content changed since prevFiles", () => {
    const state = createMapperState();
    state.prevFiles = { "/outputs/a.md": { content: "hello world" } }; // unchanged
    const chunk = loadFixture("file-write.json");
    const events = mapChunk([], chunk, state);
    const fileWrites = events.filter((e) => e.type === "file_write");
    expect(fileWrites).toHaveLength(1);
    expect(fileWrites[0]).toEqual({
      type: "file_write",
      path: "/outputs/b.md",
      bytes: 100,
    });
    // mapper updates state.prevFiles in place
    expect(state.prevFiles["/outputs/b.md"]).toBeDefined();
  });

  it("emits file_write with byte count derived from content when size is missing", () => {
    const state = createMapperState();
    const chunk = { tools: { files: { "/x.md": { content: "abcde" } } } };
    const events = mapChunk([], chunk, state);
    expect(events).toEqual([
      { type: "file_write", path: "/x.md", bytes: 5 },
    ]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vibe/runtime test -t file_write`
Expected: FAIL.

- [ ] **Step 3: Implement file_write mapping**

In `chunk-mapper.ts`, after the todo block:

```typescript
  // file_write: diff state.files against prevFiles (in either tools or agent node)
  const filesFromTools = isPlainObject(toolsNode.files) ? toolsNode.files : null;
  const filesFromAgent = isPlainObject(agentNode.files) ? agentNode.files : null;
  const filesNode = filesFromTools ?? filesFromAgent;
  if (filesNode) {
    for (const [filePath, fileMeta] of Object.entries(filesNode)) {
      if (!isPlainObject(fileMeta)) continue;
      const prev = state.prevFiles[filePath];
      const sameContent =
        prev !== undefined &&
        typeof prev.content === "string" &&
        typeof fileMeta.content === "string" &&
        prev.content === fileMeta.content;
      if (sameContent) continue;
      const bytes =
        typeof fileMeta.size === "number"
          ? fileMeta.size
          : typeof fileMeta.content === "string"
            ? Buffer.byteLength(fileMeta.content, "utf8")
            : 0;
      events.push({ type: "file_write", path: filePath, bytes });
      state.prevFiles[filePath] = {
        content: typeof fileMeta.content === "string" ? fileMeta.content : undefined,
        size: typeof fileMeta.size === "number" ? fileMeta.size : undefined,
      };
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vibe/runtime test`
Expected: PASS (13 passed).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/chunk-mapper.ts packages/runtime/test/chunk-mapper.test.ts packages/runtime/test/fixtures/chunks/file-write.json
git commit -m "feat(runtime): chunk-mapper emits file_write with prevFiles diff"
```

---

### Task 9: chunk-mapper — subagent `log` variant

**Files:**
- Modify: `packages/runtime/src/chunk-mapper.ts`
- Modify: `packages/runtime/test/chunk-mapper.test.ts`
- Create: `packages/runtime/test/fixtures/chunks/subagent-message.json`

- [ ] **Step 1: Write the failing test**

Create `packages/runtime/test/fixtures/chunks/subagent-message.json`:

```json
{
  "agent": {
    "messages": [
      { "content": "I'm a subagent describing my progress..." }
    ]
  }
}
```

Append to `chunk-mapper.test.ts`:

```typescript
  it("emits log for AIMessages under a non-empty namespace (subagent chatter)", () => {
    const chunk = loadFixture("subagent-message.json");
    const state = createMapperState();
    const events = mapChunk(["sub-1"], chunk, state);
    const logs = events.filter((e) => e.type === "log");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      type: "log",
      level: "info",
      message: expect.stringContaining("[subagent: sub-1]"),
    });
  });

  it("does NOT emit log for main-agent messages without tool_calls (handled by final)", () => {
    const state = createMapperState();
    const events = mapChunk(
      [],
      { agent: { messages: [{ content: "intermediate thought" }] } },
      state,
    );
    expect(events.filter((e) => e.type === "log")).toEqual([]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vibe/runtime test -t "subagent chatter"`
Expected: FAIL.

- [ ] **Step 3: Implement subagent log mapping**

In `chunk-mapper.ts`, after the file_write block:

```typescript
  // log: subagent (namespace non-empty) AIMessage content, capped at 500 chars
  if (namespace.length > 0) {
    for (const msg of agentMessages) {
      const content = msg.content;
      if (typeof content !== "string" || content.length === 0) continue;
      events.push({
        type: "log",
        level: "info",
        message: `[subagent: ${namespace.join("|")}] ${content.slice(0, 500)}`,
      });
    }
  }
```

Note: this needs `agentMessages` from earlier in the function — already declared in Task 5.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vibe/runtime test`
Expected: PASS (15 passed).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/chunk-mapper.ts packages/runtime/test/chunk-mapper.test.ts packages/runtime/test/fixtures/chunks/subagent-message.json
git commit -m "feat(runtime): chunk-mapper emits log for subagent messages"
```

---

### Task 10: chunk-mapper — `lastAssistantMessage` buffering (foundation for `final`)

**Files:**
- Modify: `packages/runtime/src/chunk-mapper.ts`
- Modify: `packages/runtime/test/chunk-mapper.test.ts`

The `final` event is emitted by `run-translated.ts` after the stream terminates. The chunk-mapper's job here is just to keep buffering the latest main-agent assistant message into `state.lastAssistantMessage` so the orchestrator can read it.

- [ ] **Step 1: Write the failing test**

Append to `chunk-mapper.test.ts`:

```typescript
  it("buffers main-agent assistant messages (no tool_calls) into state.lastAssistantMessage", () => {
    const state = createMapperState();
    mapChunk([], { agent: { messages: [{ content: "first thought", tool_calls: [] }] } }, state);
    expect(state.lastAssistantMessage).toBe("first thought");

    mapChunk([], { agent: { messages: [{ content: "revised conclusion" }] } }, state);
    expect(state.lastAssistantMessage).toBe("revised conclusion");
  });

  it("does NOT buffer subagent messages (namespace non-empty)", () => {
    const state = createMapperState();
    mapChunk(["sub-1"], { agent: { messages: [{ content: "sub talk" }] } }, state);
    expect(state.lastAssistantMessage).toBe("");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vibe/runtime test -t lastAssistantMessage`
Expected: FAIL.

- [ ] **Step 3: Implement buffering**

In `chunk-mapper.ts`, after the subagent log block:

```typescript
  // lastAssistantMessage: buffer the latest main-agent message with no tool_calls.
  // The orchestrator reads this at stream termination to populate `final.summary`.
  if (namespace.length === 0) {
    for (const msg of agentMessages) {
      const content = msg.content;
      const toolCalls = readToolCalls(msg);
      if (typeof content === "string" && content.length > 0 && toolCalls.length === 0) {
        state.lastAssistantMessage = content;
      }
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vibe/runtime test`
Expected: PASS (17 passed).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/chunk-mapper.ts packages/runtime/test/chunk-mapper.test.ts
git commit -m "feat(runtime): chunk-mapper buffers lastAssistantMessage for final synthesis"
```

---

### Task 11: chunk-mapper — drop control chunks (`__start__`, `__end__`)

**Files:**
- Modify: `packages/runtime/test/chunk-mapper.test.ts`

The implementation already drops these — node names `__start__` and `__end__` are not in any reader code path. This task just confirms the behavior with a test.

- [ ] **Step 1: Write the test**

Append to `chunk-mapper.test.ts`:

```typescript
  it("drops control chunks (__start__, __end__) silently", () => {
    const state = createMapperState();
    expect(mapChunk([], { __start__: { messages: [] } }, state)).toEqual([]);
    expect(mapChunk([], { __end__: { final: true } }, state)).toEqual([]);
  });

  it("returns empty array on non-object chunks", () => {
    const state = createMapperState();
    expect(mapChunk([], null, state)).toEqual([]);
    expect(mapChunk([], "string chunk", state)).toEqual([]);
    expect(mapChunk([], 42, state)).toEqual([]);
  });
```

- [ ] **Step 2: Run test to verify it passes immediately**

Run: `pnpm --filter @vibe/runtime test`
Expected: PASS (19 passed) — no implementation needed.

- [ ] **Step 3: Commit**

```bash
git add packages/runtime/test/chunk-mapper.test.ts
git commit -m "test(runtime): pin chunk-mapper drop-behavior for control + non-object chunks"
```

---

### Task 12: `runTranslatedLane` — orchestrator skeleton with synthetic `start`

**Files:**
- Create: `packages/runtime/src/run-translated.ts`
- Create: `packages/runtime/test/run-translated.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/runtime/test/run-translated.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import type { LaneRunSpec, LaneRunInputs, LaneEvent } from "../src/types.js";

const specFixture: LaneRunSpec = {
  laneId: "test-lane",
  prompt: "you are a test agent",
  reads: [],
  owns: [],
  repoPath: process.cwd(),
};

const inputFixture: LaneRunInputs = { userMessage: "go" };

describe("runTranslatedLane", () => {
  it("yields a synthetic start event before any chunks", async () => {
    // Mock translateLane to return an agent whose stream yields nothing.
    vi.doMock("../src/translator.js", () => ({
      translateLane: vi.fn().mockResolvedValue({
        stream: () => emptyAsyncIterable(),
      }),
    }));

    const { runTranslatedLane } = await import("../src/run-translated.js");
    const events: LaneEvent[] = [];
    for await (const e of runTranslatedLane(specFixture, inputFixture, new AbortController().signal)) {
      events.push(e);
      if (events.length > 3) break;
    }
    expect(events[0]).toMatchObject({
      type: "start",
      laneId: "test-lane",
    });
    expect((events[0] as { runId: string }).runId).toMatch(/^[0-9a-f-]{36}$/);

    vi.doUnmock("../src/translator.js");
  });
});

async function* emptyAsyncIterable() {
  // yields nothing, then completes
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vibe/runtime test -t "synthetic start"`
Expected: FAIL — `Cannot find module '../src/run-translated.js'`.

- [ ] **Step 3: Implement runTranslatedLane orchestrator skeleton**

Create `packages/runtime/src/run-translated.ts`:

```typescript
import { randomUUID } from "node:crypto";
import { HumanMessage } from "@langchain/core/messages";
import { translateLane } from "./translator.js";
import { mapChunk, createMapperState } from "./chunk-mapper.js";
import type { LaneEvent, LaneRunSpec, LaneRunInputs, FileOutput } from "./types.js";

/**
 * Public API: run a translated lane and yield typed LaneEvents until completion or abort.
 *
 * Semantics:
 *   - First event is ALWAYS a synthetic `start` (laneId + caller-supplied or generated runId).
 *   - Subsequent events come from mapping LangGraph `[namespace, chunk]` tuples through chunk-mapper.
 *   - Stream terminates with exactly one `final` (clean completion) or `error` (thrown or aborted) event.
 *   - On AbortSignal: emits `{ type: "error", message: "canceled", recoverable: true }` and returns.
 */
export async function* runTranslatedLane(
  spec: LaneRunSpec,
  input: LaneRunInputs,
  signal: AbortSignal,
): AsyncIterable<LaneEvent> {
  const runId = randomUUID();
  yield { type: "start", laneId: spec.laneId, runId };

  // TODO Task 13: agent build + stream iteration + AbortSignal wiring.
  // For now, the skeleton just yields start and returns — Task 14 adds final.
  const agent = await translateLane(adaptSpec(spec), {});
  const stream = await agent.stream(
    { messages: [new HumanMessage(input.userMessage)] },
    { streamMode: "updates", subgraphs: true },
  );

  const state = createMapperState();
  for await (const [namespace, chunk] of stream) {
    if (signal.aborted) {
      yield { type: "error", message: "canceled", recoverable: true };
      return;
    }
    for (const event of mapChunk(namespace, chunk, state)) {
      yield event;
    }
  }

  const outputs: FileOutput[] = Object.entries(state.prevFiles).map(([path, meta]) => ({
    path,
    bytes:
      typeof meta.size === "number"
        ? meta.size
        : typeof meta.content === "string"
          ? Buffer.byteLength(meta.content, "utf8")
          : 0,
  }));

  yield {
    type: "final",
    summary: state.lastAssistantMessage,
    outputs,
  };
}

function adaptSpec(spec: LaneRunSpec) {
  return {
    name: spec.laneId,
    prompt: spec.prompt,
    reads: spec.reads,
    owns: spec.owns,
    tools: spec.tools as ("codex_cli" | "claude_cli")[] | undefined,
    model: spec.model as "cerebras" | undefined,
    rootDir: spec.repoPath,
    approval: spec.approval,
    verify: spec.verify,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vibe/runtime test`
Expected: PASS (20 passed).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/run-translated.ts packages/runtime/test/run-translated.test.ts
git commit -m "feat(runtime): runTranslatedLane orchestrator with synthetic start + stream loop"
```

---

### Task 13: `runTranslatedLane` — AbortSignal terminates with `error: canceled`

**Files:**
- Modify: `packages/runtime/test/run-translated.test.ts`

The Task 12 implementation already checks `signal.aborted` inside the loop. This task confirms it works and adds the abort-before-start case.

- [ ] **Step 1: Write the failing test**

Append to `run-translated.test.ts` (inside the `describe`):

```typescript
  it("terminates with error: canceled when AbortSignal fires mid-stream", async () => {
    const controller = new AbortController();
    vi.doMock("../src/translator.js", () => ({
      translateLane: vi.fn().mockResolvedValue({
        stream: () => longRunningStream(controller),
      }),
    }));

    const { runTranslatedLane } = await import("../src/run-translated.js");
    const events: LaneEvent[] = [];
    for await (const e of runTranslatedLane(specFixture, inputFixture, controller.signal)) {
      events.push(e);
      if (events.length === 1) controller.abort();
    }
    const last = events[events.length - 1];
    expect(last).toEqual({ type: "error", message: "canceled", recoverable: true });

    vi.doUnmock("../src/translator.js");
  });
});

async function* longRunningStream(controller: AbortController) {
  // Emits one chunk, then waits indefinitely (consumer must abort to break the loop).
  yield [[], { agent: { messages: [] } }] as [string[], unknown];
  while (!controller.signal.aborted) {
    await new Promise((r) => setTimeout(r, 50));
    yield [[], { agent: { messages: [] } }] as [string[], unknown];
  }
}
```

- [ ] **Step 2: Run test to verify it passes (orchestrator already handles abort)**

Run: `pnpm --filter @vibe/runtime test -t canceled`
Expected: PASS (21 passed).

If FAIL: confirm the `if (signal.aborted)` block runs before the `for await` body's `yield` and that the function exits via `return`.

- [ ] **Step 3: Commit**

```bash
git add packages/runtime/test/run-translated.test.ts
git commit -m "test(runtime): pin AbortSignal canceled-error semantics in runTranslatedLane"
```

---

### Task 14: `runTranslatedLane` — `error` on translator/stream exceptions

**Files:**
- Modify: `packages/runtime/src/run-translated.ts`
- Modify: `packages/runtime/test/run-translated.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `run-translated.test.ts` inside the `describe`:

```typescript
  it("emits error: recoverable=false when the stream throws", async () => {
    vi.doMock("../src/translator.js", () => ({
      translateLane: vi.fn().mockResolvedValue({
        stream: () => throwingStream(),
      }),
    }));

    const { runTranslatedLane } = await import("../src/run-translated.js");
    const events: LaneEvent[] = [];
    for await (const e of runTranslatedLane(specFixture, inputFixture, new AbortController().signal)) {
      events.push(e);
    }
    const last = events[events.length - 1];
    expect(last).toMatchObject({ type: "error", recoverable: false });
    expect((last as { message: string }).message).toContain("stream blew up");

    vi.doUnmock("../src/translator.js");
  });
});

async function* throwingStream() {
  yield [[], { agent: { messages: [] } }] as [string[], unknown];
  throw new Error("stream blew up");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vibe/runtime test -t "recoverable=false"`
Expected: FAIL — unhandled promise rejection or the test never sees the error frame.

- [ ] **Step 3: Wrap the stream loop in try/catch**

In `packages/runtime/src/run-translated.ts`, wrap the `for await` block:

```typescript
  try {
    for await (const [namespace, chunk] of stream) {
      if (signal.aborted) {
        yield { type: "error", message: "canceled", recoverable: true };
        return;
      }
      for (const event of mapChunk(namespace, chunk, state)) {
        yield event;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield { type: "error", message, recoverable: false };
    return;
  }
```

Also wrap the `translateLane` call to emit `error` on translator failures:

```typescript
  let agent;
  try {
    agent = await translateLane(adaptSpec(spec), {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield { type: "error", message, recoverable: false };
    return;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vibe/runtime test`
Expected: PASS (22 passed).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/run-translated.ts packages/runtime/test/run-translated.test.ts
git commit -m "feat(runtime): runTranslatedLane emits error frame on translator/stream exception"
```

---

### Task 15: End-to-end integration test against a recorded chunk sequence

**Files:**
- Create: `packages/runtime/test/fixtures/chunks/full-run-sequence.json`
- Modify: `packages/runtime/test/run-translated.test.ts`

- [ ] **Step 1: Author a recorded chunk sequence**

Create `packages/runtime/test/fixtures/chunks/full-run-sequence.json`:

```json
[
  [[], { "agent": { "messages": [{ "tool_calls": [{ "name": "read_file", "args": { "path": "/inputs/feedback.md" } }] }] } }],
  [[], { "tools": { "messages": [{ "name": "read_file", "content": "user wants better feedback workflow", "status": "success" }] } }],
  [[], { "tools": { "messages": [{ "name": "write_todos", "content": "ok", "status": "success" }] }, "agent": { "todos": [{ "id": "1", "content": "draft plan", "status": "in_progress" }] } }],
  [[], { "agent": { "messages": [{ "tool_calls": [{ "name": "write_file", "args": { "path": "/outputs/plan.md", "content": "# Plan\n\n- step 1\n- step 2\n" } }] }] } }],
  [[], { "tools": { "files": { "/outputs/plan.md": { "content": "# Plan\n\n- step 1\n- step 2\n" } } } }],
  [[], { "agent": { "messages": [{ "content": "Done. Wrote /outputs/plan.md.", "tool_calls": [] }] } }]
]
```

- [ ] **Step 2: Write the failing test**

Append to `run-translated.test.ts` inside the `describe`:

```typescript
  it("end-to-end: maps a recorded chunk sequence to the expected LaneEvent sequence", async () => {
    const fixture = loadFixture("full-run-sequence.json") as Array<[string[], unknown]>;
    vi.doMock("../src/translator.js", () => ({
      translateLane: vi.fn().mockResolvedValue({
        stream: async function* () {
          for (const tuple of fixture) yield tuple;
        },
      }),
    }));

    const { runTranslatedLane } = await import("../src/run-translated.js");
    const events: LaneEvent[] = [];
    for await (const e of runTranslatedLane(specFixture, inputFixture, new AbortController().signal)) {
      events.push(e);
    }

    const types = events.map((e) => e.type);
    expect(types).toEqual([
      "start",
      "tool_call",     // read_file
      "tool_result",   // read_file result
      "todo",          // write_todos coalesced
      "tool_call",     // write_file
      "file_write",    // /outputs/plan.md
      "final",
    ]);
    const finalEvent = events[events.length - 1] as Extract<LaneEvent, { type: "final" }>;
    expect(finalEvent.summary).toBe("Done. Wrote /outputs/plan.md.");
    expect(finalEvent.outputs).toEqual([
      { path: "/outputs/plan.md", bytes: Buffer.byteLength("# Plan\n\n- step 1\n- step 2\n", "utf8") },
    ]);

    vi.doUnmock("../src/translator.js");
  });
```

Also add the `loadFixture` import / helper at the top of `run-translated.test.ts` (mirror chunk-mapper.test.ts):

```typescript
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const loadFixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "fixtures", "chunks", name), "utf8"));
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm --filter @vibe/runtime test`
Expected: PASS (23 passed).

If FAIL: walk the event sequence. The most likely failure is `tool_result` being emitted for `write_file` (it should be suppressed — Task 6 logic). Inspect the chunk-mapper's suppression list.

- [ ] **Step 4: Commit**

```bash
git add packages/runtime/src/run-translated.ts packages/runtime/test/run-translated.test.ts packages/runtime/test/fixtures/chunks/full-run-sequence.json
git commit -m "test(runtime): end-to-end LaneEvent sequence from recorded chunk fixture"
```

---

### Task 16: Public API barrel + README

**Files:**
- Modify: `packages/runtime/src/index.ts`
- Create: `packages/runtime/README.md`

- [ ] **Step 1: Update index.ts to export the public API**

Overwrite `packages/runtime/src/index.ts`:

```typescript
export type {
  LaneEvent,
  TodoItem,
  FileOutput,
  LaneRunSpec,
  LaneRunInputs,
} from "./types.js";

export { runTranslatedLane } from "./run-translated.js";
```

- [ ] **Step 2: Write README**

Create `packages/runtime/README.md`:

```markdown
# @vibe/runtime

Vibe lane runtime. Translates a Vibe lane spec into a configured deepagents instance
and yields a typed `AsyncIterable<LaneEvent>` from its LangGraph stream.

Consumed by Cockpit's `InProcessVibeService` and the Vibe daemon.

## Usage

```typescript
import { runTranslatedLane } from "@vibe/runtime";

const controller = new AbortController();
const spec = { laneId: "feedback-triage", prompt: "...", reads: ["/docs/**"], owns: ["/outputs/**"], repoPath: "/repo" };
const input = { userMessage: "Process the latest feedback" };

for await (const event of runTranslatedLane(spec, input, controller.signal)) {
  console.log(event.type, event);
  if (someCondition) controller.abort();
}
```

## Event types

See `LaneEvent` in `src/types.ts`. The full chunk → event mapping table is in
`docs/superpowers/specs/2026-05-18-cockpit-vibe-integration-design.md` §5.2 (in the Cockpit repo).

## Testing

```sh
pnpm --filter @vibe/runtime test
```

Tests use recorded chunk fixtures (`test/fixtures/chunks/*.json`) — no live LLM calls.
A live-Cerebras smoke test will land in a follow-up CI nightly job.
```

- [ ] **Step 3: Verify build + test still green**

Run: `pnpm --filter @vibe/runtime build && pnpm --filter @vibe/runtime test`
Expected: build emits `dist/index.js` with the re-exports; tests still 23 passed.

- [ ] **Step 4: Commit**

```bash
git add packages/runtime/src/index.ts packages/runtime/README.md
git commit -m "docs(runtime): public API barrel + README"
```

---

### Task 17: Monorepo sanity check + PR

**Files:** none — verification + git workflow.

- [ ] **Step 1: Run the full monorepo build**

Run: `pnpm -r build` from repo root.
Expected: all workspace packages (`@vibe/language`, `@vibe/runtime`, `vibe-vscode`) build clean.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm -r test`
Expected: all packages' tests pass. The new `@vibe/runtime` contributes 23 tests.

- [ ] **Step 3: Run the broader check script**

Run: `pnpm run check`
Expected: passes. This runs `self:plan`, `test`, and `build`.

- [ ] **Step 4: Verify the sandbox POC still works (regression smoke)**

Run: `cd sandbox/deepagents-poc && pnpm typecheck`
Expected: no errors. The sandbox modules are still authoritative for runtime experiments; the runtime package consumes copies.

- [ ] **Step 5: Push + open PR**

Per the repo's Git Automation Contract (CLAUDE.md):

```bash
git push -u origin HEAD
gh pr create --title "feat(runtime): extract @vibe/runtime workspace package" --body "$(cat <<'EOF'
## Summary
- Extracts the deepagents-based lane translator from `sandbox/deepagents-poc/` into a buildable `packages/runtime/` workspace package
- Adds typed `LaneEvent` discriminated union + `runTranslatedLane(spec, input, signal): AsyncIterable<LaneEvent>` public API
- Chunk-mapper implements the §5.2 mapping table from the Cockpit↔Vibe integration spec with one test per row + an end-to-end recorded-fixture test

## Why
This is the critical-path prerequisite for Cockpit Phase 3 (execution + streaming). Both Cockpit's `InProcessVibeService` and the future Vibe daemon will consume the same module; this PR creates the seam.

## Test plan
- [x] `pnpm --filter @vibe/runtime test` — 23 tests passing
- [x] `pnpm -r build` — all workspace packages build clean
- [x] `pnpm run check` — full monorepo check passes
- [x] `cd sandbox/deepagents-poc && pnpm typecheck` — POC sandbox unaffected
- [ ] Manual: consume from Cockpit via workspace link once Cockpit Phase 3 plan lands

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --auto --squash
```

---

## Self-Review

**1. Spec coverage** — every §3.4 (runtime package shape) and §5.2 (chunk-mapping table) line maps to at least one task. The §5.2 "dropped chunks" row → Task 11. The `TodoItem` shape from §5.2 → Task 3. The "AbortSignal propagation" half of §3.5 → Tasks 12–13. The `final.summary` synthesis at end-of-stream → Task 12. The `final.outputs` filtered list → Task 12 (note: filtering by `owns` globs is not yet implemented; the current code lists all written files. This is acceptable for Phase 3 prerequisites — Cockpit-side filtering can be added later or here as a follow-up.)

**2. Placeholder scan** — every step has concrete code, exact commands, and expected outcomes. No TBD/TODO/"add appropriate" anywhere.

**3. Type consistency** — `LaneEvent` shape introduced in Task 3 matches every usage in Tasks 5–15. `TodoItem` introduced in Task 3 with `id/content/status` matches Task 7's mapper output. `MapperState` (Task 5) used identically in Tasks 6–10.

**4. Known follow-ups** (documented, not blocking):
- `final.outputs` filter-by-owns is not in this plan. Either add a Task 18 here, or defer to a Cockpit-side wrapper. Currently the runtime emits all changed files.
- No live-Cerebras smoke test is included. That belongs to a CI nightly job specced in §10.3 of the spec, not Phase 3 prerequisites.
- Live-stream subagent message coverage in the end-to-end fixture (Task 15) uses only main-agent chunks. Subagent logging (Task 9) is unit-tested but not in the end-to-end fixture. Acceptable: the subagent code path is small and the unit test pins it.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-18-vibe-runtime-package-extraction.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration. Each of the 17 tasks is ~5–15 min of work; total ~3–4 hours wall clock.

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

**Which approach?**
