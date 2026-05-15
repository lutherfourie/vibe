# Vibe v0 — Sub-Deliverable 1: Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the placeholder Langium grammar at `packages/language/src/vibe.langium` into a complete Vibe v0 language spec — all 9 primitives, expressions, gradual-typing annotation slot, and cross-reference validators — with a TDD test suite that proves each construct parses and validates correctly.

**Architecture:** Langium 4.2.4 owns the lexer / parser / AST / LSP / TextMate emission via a single `.langium` grammar file. AST types regenerate automatically into `src/generated/`. Cross-reference validators live in the Vibe service container (`vibe-module.ts`). Tests use Vitest with Langium's `parseHelper` to exercise the parser end-to-end without booting the LSP. Each grammar growth follows strict TDD: write failing test → grow grammar → regenerate AST → make test pass → commit.

**Tech Stack:**
- Langium 4.2.4 + langium-cli 4.2.1 (parser, AST, LSP, TextMate)
- TypeScript 5.6.3 (strict, ES2022, NodeNext)
- Vitest 2.x (test runner)
- pnpm 10.33.4 workspaces

**Spec context:** `docs/superpowers/specs/2026-05-13-vibe-language-v0.md` §2 (the 9 primitives), §3 (syntax rules), §9 (gradual typing).

**Out of scope for SD1:** file-shape dispatcher (SD2), LLM resolver (SD2), `vibe init` pipeline (SD3), VS Code extension polish (SD4), markdown-with-fenced-blocks shape (SD2). SD1 only handles **structured `.vibe` files** that parse cleanly with the grammar.

---

## File Structure

Files this plan creates or modifies, with responsibility:

```text
packages/language/
├── src/
│   ├── vibe.langium                    (MODIFY: grow placeholder to full v0)
│   ├── vibe-module.ts                  (MODIFY: register cross-reference validators)
│   ├── vibe-validator.ts               (CREATE: Vibe-specific validation logic)
│   ├── index.ts                        (MODIFY: re-export new validator types if needed)
│   ├── language-server.ts              (UNCHANGED — already wires Langium server)
│   └── generated/                      (REGENERATE: langium-cli emits these)
├── test/
│   ├── parse-helper.ts                 (CREATE: shared test helper)
│   ├── primitives/
│   │   ├── provider.test.ts            (CREATE: provider primitive tests)
│   │   ├── route.test.ts               (CREATE)
│   │   ├── plugin.test.ts              (CREATE)
│   │   ├── persona.test.ts             (CREATE)
│   │   ├── memory.test.ts              (CREATE)
│   │   ├── harness.test.ts             (CREATE)
│   │   ├── trigger.test.ts             (CREATE)
│   │   └── agent.test.ts               (CREATE)
│   ├── expressions/
│   │   ├── literals.test.ts            (CREATE: string, number, bool, null)
│   │   ├── references.test.ts          (CREATE: ID, DottedId)
│   │   ├── collections.test.ts         (CREATE: list, object)
│   │   ├── type-annotations.test.ts    (CREATE: `key : Type = value`)
│   │   └── comments.test.ts            (CREATE: line and block comments)
│   ├── validators/
│   │   ├── reserved-routes.test.ts     (CREATE: resolver route must exist)
│   │   ├── cross-references.test.ts    (CREATE: agent.uses → declared plugin, etc.)
│   │   └── duplicate-declarations.test.ts (CREATE: two agents with same name)
│   └── integration/
│       └── canonical-project.test.ts   (CREATE: full project.vibe parses + validates)
├── examples/                            (relocate from repo root; one file per primitive)
│   ├── 01-provider.vibe                (CREATE)
│   ├── 02-route.vibe                   (CREATE)
│   ├── 03-plugin.vibe                  (CREATE)
│   ├── 04-persona.vibe                 (CREATE)
│   ├── 05-memory.vibe                  (CREATE)
│   ├── 06-harness.vibe                 (CREATE)
│   ├── 07-trigger.vibe                 (CREATE)
│   ├── 08-agent.vibe                   (CREATE)
│   └── 09-project.vibe                 (CREATE: composite example)
├── package.json                         (MODIFY: add vitest + scripts)
├── vitest.config.ts                    (CREATE: Vitest configuration)
└── README.md                           (MODIFY: update with real surface)
```

Existing `examples/hello.vibe` at the repo root is the placeholder and gets removed when the new examples land (it's covered by `examples/08-agent.vibe`).

---

## Task 1: Test infrastructure setup

**Files:**
- Modify: `c:/Hive/vibe/packages/language/package.json` (add Vitest)
- Create: `c:/Hive/vibe/packages/language/vitest.config.ts`
- Create: `c:/Hive/vibe/packages/language/test/parse-helper.ts`
- Create: `c:/Hive/vibe/packages/language/test/parse-helper.smoke.test.ts`

- [ ] **Step 1: Install Vitest in the language package**

From `c:/Hive/vibe`:

```bash
pnpm --filter @vibe/language add -D vitest@^2 @vitest/coverage-v8@^2
```

Expected: `pnpm-lock.yaml` updates; `node_modules/vitest` appears under `packages/language`; no errors.

- [ ] **Step 2: Add test scripts to packages/language/package.json**

Replace the `scripts` block in `packages/language/package.json` with:

```json
"scripts": {
  "langium:generate": "langium generate",
  "build": "pnpm run langium:generate && tsc -p tsconfig.json",
  "test": "vitest run",
  "test:watch": "vitest",
  "clean": "rimraf dist src/generated"
}
```

- [ ] **Step 3: Create the Vitest config**

Write `c:/Hive/vibe/packages/language/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    pool: "forks",
  },
});
```

- [ ] **Step 4: Create the shared parse helper**

Write `c:/Hive/vibe/packages/language/test/parse-helper.ts`:

```typescript
import { EmptyFileSystem } from "langium";
import { parseHelper } from "langium/test";
import type { Project } from "../src/generated/ast.js";
import { createVibeServices } from "../src/vibe-module.js";

const services = createVibeServices(EmptyFileSystem).Vibe;

export const parseVibe = parseHelper<Project>(services);

export async function expectParses(source: string): Promise<Project> {
  const document = await parseVibe(source);
  const errors = document.parseResult.lexerErrors.concat(
    document.parseResult.parserErrors,
  );
  if (errors.length > 0) {
    const messages = errors.map((e) => e.message).join("\n");
    throw new Error(`Parse failed:\n${messages}\n\nSource:\n${source}`);
  }
  return document.parseResult.value;
}

export async function expectParseFailure(source: string): Promise<string[]> {
  const document = await parseVibe(source);
  return document.parseResult.lexerErrors
    .concat(document.parseResult.parserErrors)
    .map((e) => e.message);
}
```

- [ ] **Step 5: Write a smoke test that exercises the helper against the existing placeholder**

Write `c:/Hive/vibe/packages/language/test/parse-helper.smoke.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { expectParses } from "./parse-helper.js";

describe("parse helper smoke test", () => {
  it("parses the existing placeholder grammar — empty agent + route", async () => {
    const project = await expectParses(`
      agent planner {}
      route planner -> worker
    `);
    expect(project.declarations).toHaveLength(2);
  });
});
```

- [ ] **Step 6: Run the smoke test and verify it passes**

Run from `c:/Hive/vibe`:

```bash
pnpm --filter @vibe/language test
```

Expected output: `Test Files  1 passed (1)` and `Tests  1 passed (1)`. If the test fails, the language services are not exporting `createVibeServices` correctly — check `packages/language/src/index.ts` re-exports.

- [ ] **Step 7: Commit**

```bash
git -C c:/Hive/vibe add packages/language/package.json packages/language/vitest.config.ts packages/language/test/ pnpm-lock.yaml
git -C c:/Hive/vibe commit -m "test(language): wire up Vitest + parseHelper smoke test"
```

---

## Task 2: Expression — literals (strings, numbers, booleans, null)

The grammar grows by adding a unified `Expression` rule that the primitive blocks will reference. Start with literals.

**Files:**
- Modify: `c:/Hive/vibe/packages/language/src/vibe.langium`
- Create: `c:/Hive/vibe/packages/language/test/expressions/literals.test.ts`

- [ ] **Step 1: Write the failing test**

Write `c:/Hive/vibe/packages/language/test/expressions/literals.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { expectParses } from "../parse-helper.js";

describe("literal expressions", () => {
  it("parses string literals (single line)", async () => {
    const project = await expectParses(`
      persona p { description = "coordinator, dry" }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses integer literals", async () => {
    const project = await expectParses(`
      persona p { verbosity_level = 3 }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses decimal literals", async () => {
    const project = await expectParses(`
      persona p { temperature = 0.3 }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses boolean literals", async () => {
    const project = await expectParses(`
      persona p { active = true }
      persona q { active = false }
    `);
    expect(project.declarations).toHaveLength(2);
  });

  it("parses null literal", async () => {
    const project = await expectParses(`
      persona p { description = null }
    `);
    expect(project.declarations).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test and verify all five FAIL**

Run from `c:/Hive/vibe`:

```bash
pnpm --filter @vibe/language test test/expressions/literals.test.ts
```

Expected: `Tests  5 failed`. Each error mentions an unexpected token at the `description =` position — the placeholder grammar has no `persona`, no field assignments, no expressions.

- [ ] **Step 3: Grow the grammar to support persona declarations + literal expressions**

Replace `c:/Hive/vibe/packages/language/src/vibe.langium` entirely with:

```text
// Vibe v0 grammar — growing TDD-style. See:
//   docs/superpowers/specs/2026-05-13-vibe-language-v0.md
//   docs/superpowers/plans/2026-05-13-vibe-v0-sd1-language.md

grammar Vibe

entry Project:
    declarations+=Declaration*;

Declaration:
    Agent | Route | Persona;

Agent:
    'agent' name=ID '{' '}';

Route:
    'route' from=ID '->' to=ID;

Persona:
    'persona' name=ID '{' fields+=Field* '}';

Field:
    name=ID '=' value=Expression;

Expression:
    StringLiteral | NumberLiteral | BooleanLiteral | NullLiteral;

StringLiteral:
    value=STRING;

NumberLiteral:
    value=NUMBER;

BooleanLiteral:
    value=('true' | 'false');

NullLiteral:
    {infer NullLiteral} 'null';

hidden terminal WS: /\s+/;
terminal ID: /[a-zA-Z_][\w]*/;
terminal STRING: /"(\\.|[^"\\])*"/;
terminal NUMBER returns number: /-?[0-9]+(\.[0-9]+)?/;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
```

- [ ] **Step 4: Regenerate the AST and run the tests**

Run from `c:/Hive/vibe`:

```bash
pnpm --filter @vibe/language langium:generate
pnpm --filter @vibe/language test test/expressions/literals.test.ts
```

Expected: `Tests  5 passed`. If any fail, the grammar didn't accept the test input — re-read the error and adjust.

- [ ] **Step 5: Run the full test suite**

```bash
pnpm --filter @vibe/language test
```

Expected: `Tests  6 passed` (5 new + 1 smoke). If the smoke test broke, the change removed something it relied on — check `Declaration` still includes Agent and Route.

- [ ] **Step 6: Commit**

```bash
git -C c:/Hive/vibe add packages/language/src/vibe.langium packages/language/test/expressions/literals.test.ts
git -C c:/Hive/vibe commit -m "feat(language): literal expressions (string, number, bool, null) + persona scaffold"
```

---

## Task 3: Expression — references (Identifier, DottedId)

Routes, agents, and triggers all reference declared things by name. Need single-segment identifiers (e.g., `worker`) and dotted-id references (e.g., `plugin.asset_pipeline.list_backlog`).

**Files:**
- Modify: `c:/Hive/vibe/packages/language/src/vibe.langium`
- Create: `c:/Hive/vibe/packages/language/test/expressions/references.test.ts`

- [ ] **Step 1: Write the failing test**

Write `c:/Hive/vibe/packages/language/test/expressions/references.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { expectParses } from "../parse-helper.js";

describe("reference expressions", () => {
  it("parses single-segment identifier as a value", async () => {
    const project = await expectParses(`
      persona p { profile = izsha_voice }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses dotted identifier as a value", async () => {
    const project = await expectParses(`
      persona p { tool = plugin.asset_pipeline.list_backlog }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses two-segment dotted identifier", async () => {
    const project = await expectParses(`
      persona p { provider = cerebras.glm_4_7 }
    `);
    expect(project.declarations).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test and verify FAIL**

```bash
pnpm --filter @vibe/language test test/expressions/references.test.ts
```

Expected: 3 failures — `Expression` rule doesn't accept bare identifiers.

- [ ] **Step 3: Grow the grammar to support reference expressions**

In `packages/language/src/vibe.langium`, modify the `Expression` rule and add a `Reference` rule:

```text
Expression:
    StringLiteral | NumberLiteral | BooleanLiteral | NullLiteral | Reference;

Reference:
    segments+=ID ('.' segments+=ID)*;
```

- [ ] **Step 4: Regenerate the AST and run the tests**

```bash
pnpm --filter @vibe/language langium:generate
pnpm --filter @vibe/language test test/expressions/references.test.ts
```

Expected: `Tests  3 passed`.

- [ ] **Step 5: Run the full test suite**

```bash
pnpm --filter @vibe/language test
```

Expected: `Tests  9 passed` (6 prior + 3 new).

- [ ] **Step 6: Commit**

```bash
git -C c:/Hive/vibe add packages/language/src/vibe.langium packages/language/test/expressions/references.test.ts
git -C c:/Hive/vibe commit -m "feat(language): reference expressions (Identifier, DottedId)"
```

---

## Task 4: Expression — collections (list, object)

Agents declare `uses = [plugin.x, plugin.y]` and `routes = { planner = route.planner }`. Need list and object literals.

**Files:**
- Modify: `c:/Hive/vibe/packages/language/src/vibe.langium`
- Create: `c:/Hive/vibe/packages/language/test/expressions/collections.test.ts`

- [ ] **Step 1: Write the failing test**

Write `c:/Hive/vibe/packages/language/test/expressions/collections.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { expectParses } from "../parse-helper.js";

describe("collection expressions", () => {
  it("parses empty list", async () => {
    const project = await expectParses(`
      persona p { uses = [] }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses list of references", async () => {
    const project = await expectParses(`
      persona p { uses = [plugin.asset_pipeline, plugin.deploy] }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses list with trailing comma", async () => {
    const project = await expectParses(`
      persona p { uses = [plugin.asset_pipeline,] }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses list of mixed literals", async () => {
    const project = await expectParses(`
      persona p { tags = ["urgent", "v0", 1, true] }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses empty object", async () => {
    const project = await expectParses(`
      persona p { routes = {} }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses object with key-value pairs", async () => {
    const project = await expectParses(`
      persona p {
        routes = { planner = route.planner, generator = route.generator }
      }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses nested list inside object", async () => {
    const project = await expectParses(`
      persona p {
        groups = { workers = [plugin.a, plugin.b], heroes = [plugin.c] }
      }
    `);
    expect(project.declarations).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test and verify FAIL**

```bash
pnpm --filter @vibe/language test test/expressions/collections.test.ts
```

Expected: 7 failures — grammar doesn't know `[` or `{` inside expressions.

- [ ] **Step 3: Grow the grammar to support collections**

In `packages/language/src/vibe.langium`, modify `Expression` and add `ListExpression` + `ObjectExpression`:

```text
Expression:
    StringLiteral | NumberLiteral | BooleanLiteral | NullLiteral
    | Reference | ListExpression | ObjectExpression;

ListExpression:
    {infer ListExpression} '[' (items+=Expression (',' items+=Expression)* ','?)? ']';

ObjectExpression:
    {infer ObjectExpression} '{' (entries+=ObjectEntry (',' entries+=ObjectEntry)* ','?)? '}';

ObjectEntry:
    key=ID '=' value=Expression;
```

- [ ] **Step 4: Regenerate the AST and run the tests**

```bash
pnpm --filter @vibe/language langium:generate
pnpm --filter @vibe/language test test/expressions/collections.test.ts
```

Expected: `Tests  7 passed`. If a test fails with "alternative expected", the parser is being ambiguous — re-check the Expression alternatives order.

- [ ] **Step 5: Run the full test suite**

```bash
pnpm --filter @vibe/language test
```

Expected: `Tests  16 passed` (9 prior + 7 new).

- [ ] **Step 6: Commit**

```bash
git -C c:/Hive/vibe add packages/language/src/vibe.langium packages/language/test/expressions/collections.test.ts
git -C c:/Hive/vibe commit -m "feat(language): list and object collection expressions"
```

---

## Task 5: Type annotation slot (gradual typing)

The spec says: `<key> : <Type> = <expression>` — optional type annotation parsed at v0 but only runtime-checked.

**Files:**
- Modify: `c:/Hive/vibe/packages/language/src/vibe.langium`
- Create: `c:/Hive/vibe/packages/language/test/expressions/type-annotations.test.ts`

- [ ] **Step 1: Write the failing test**

Write `c:/Hive/vibe/packages/language/test/expressions/type-annotations.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { expectParses } from "../parse-helper.js";

describe("type annotations on fields", () => {
  it("parses field without annotation", async () => {
    const project = await expectParses(`
      persona p { description = "coordinator" }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses field with simple type annotation", async () => {
    const project = await expectParses(`
      persona p { description : String = "coordinator" }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses field with dotted type annotation", async () => {
    const project = await expectParses(`
      persona p { memory : memory.Spineflow = memory.izsha_global }
    `);
    expect(project.declarations).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test and verify FAIL**

```bash
pnpm --filter @vibe/language test test/expressions/type-annotations.test.ts
```

Expected: 2 failures (only the no-annotation test passes; annotated tests fail).

- [ ] **Step 3: Grow the grammar — add optional `: Type` to Field**

In `packages/language/src/vibe.langium`, modify the `Field` rule:

```text
Field:
    name=ID (':' type=TypeReference)? '=' value=Expression;

TypeReference:
    segments+=ID ('.' segments+=ID)*;
```

- [ ] **Step 4: Regenerate the AST and run the tests**

```bash
pnpm --filter @vibe/language langium:generate
pnpm --filter @vibe/language test test/expressions/type-annotations.test.ts
```

Expected: `Tests  3 passed`.

- [ ] **Step 5: Run the full test suite**

```bash
pnpm --filter @vibe/language test
```

Expected: `Tests  19 passed` (16 prior + 3 new).

- [ ] **Step 6: Commit**

```bash
git -C c:/Hive/vibe add packages/language/src/vibe.langium packages/language/test/expressions/type-annotations.test.ts
git -C c:/Hive/vibe commit -m "feat(language): optional type annotations on fields (gradual typing)"
```

---

## Task 6: Comments

Verify the existing comment terminals work in real usage — line and block.

**Files:**
- Create: `c:/Hive/vibe/packages/language/test/expressions/comments.test.ts`

- [ ] **Step 1: Write the failing test (likely passes — verifying behavior)**

Write `c:/Hive/vibe/packages/language/test/expressions/comments.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { expectParses } from "../parse-helper.js";

describe("comments", () => {
  it("ignores line comments at top level", async () => {
    const project = await expectParses(`
      // This is a line comment
      persona p { description = "x" }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("ignores line comments inside blocks", async () => {
    const project = await expectParses(`
      persona p {
        // comment here
        description = "x"
      }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("ignores block comments", async () => {
    const project = await expectParses(`
      /* block comment */
      persona p { description = "x" }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("ignores multi-line block comments", async () => {
    const project = await expectParses(`
      /*
        multi-line
        block comment
      */
      persona p { description = "x" }
    `);
    expect(project.declarations).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm --filter @vibe/language test test/expressions/comments.test.ts
```

Expected: `Tests  4 passed`. If any fail, the comment terminals are misconfigured — re-check the regex.

- [ ] **Step 3: Commit**

```bash
git -C c:/Hive/vibe add packages/language/test/expressions/comments.test.ts
git -C c:/Hive/vibe commit -m "test(language): verify line and block comments are ignored by parser"
```

---

## Task 7: `provider` primitive

Each primitive gets one task. Tests parse the full primitive surface from spec §2.1.

**Files:**
- Modify: `c:/Hive/vibe/packages/language/src/vibe.langium`
- Create: `c:/Hive/vibe/packages/language/test/primitives/provider.test.ts`

- [ ] **Step 1: Write the failing test**

Write `c:/Hive/vibe/packages/language/test/primitives/provider.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { expectParses } from "../parse-helper.js";

describe("provider primitive", () => {
  it("parses minimal API-mode provider", async () => {
    const project = await expectParses(`
      provider cerebras.glm_4_7 { mode = api }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses CLI-mode provider with lifecycle override", async () => {
    const project = await expectParses(`
      provider anthropic.claude_code {
        mode      = cli
        lifecycle = long_lived
      }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses API-mode provider with base URL override", async () => {
    const project = await expectParses(`
      provider cerebras.glm_4_7 {
        mode    = api
        baseUrl = "https://api.cerebras.ai/v1"
        model   = "glm-4.7"
      }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses multiple provider declarations", async () => {
    const project = await expectParses(`
      provider anthropic.claude_code { mode = cli }
      provider openai.codex          { mode = cli }
      provider cerebras.glm_4_7      { mode = api }
    `);
    expect(project.declarations).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the test and verify FAIL**

```bash
pnpm --filter @vibe/language test test/primitives/provider.test.ts
```

Expected: 4 failures — grammar doesn't know the `provider` keyword.

- [ ] **Step 3: Grow the grammar — add `Provider` declaration**

In `packages/language/src/vibe.langium`:

1. Add `Provider` to the `Declaration` alternatives:

```text
Declaration:
    Agent | Route | Persona | Provider;
```

2. Add the `Provider` rule. Note: provider names use dotted-id syntax (`cerebras.glm_4_7`), so the grammar must accept that as a name. Use a `QualifiedName` helper:

```text
Provider:
    'provider' name=QualifiedName '{' fields+=Field* '}';

QualifiedName:
    segments+=ID ('.' segments+=ID)*;
```

- [ ] **Step 4: Regenerate the AST and run the tests**

```bash
pnpm --filter @vibe/language langium:generate
pnpm --filter @vibe/language test test/primitives/provider.test.ts
```

Expected: `Tests  4 passed`.

- [ ] **Step 5: Run the full test suite**

```bash
pnpm --filter @vibe/language test
```

Expected: `Tests  27 passed` (23 prior + 4 new).

- [ ] **Step 6: Commit**

```bash
git -C c:/Hive/vibe add packages/language/src/vibe.langium packages/language/test/primitives/provider.test.ts
git -C c:/Hive/vibe commit -m "feat(language): provider primitive"
```

---

## Task 8: `route` primitive — full surface

The placeholder already has a minimal `route X -> Y` rule. Extend it to support `{ mode = ... }` body, the special `fallback -> X` form, and dotted-id targets.

**Files:**
- Modify: `c:/Hive/vibe/packages/language/src/vibe.langium`
- Create: `c:/Hive/vibe/packages/language/test/primitives/route.test.ts`

- [ ] **Step 1: Write the failing test**

Write `c:/Hive/vibe/packages/language/test/primitives/route.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { expectParses } from "../parse-helper.js";

describe("route primitive", () => {
  it("parses simple route to dotted-id target", async () => {
    const project = await expectParses(`
      route planner -> anthropic.claude_code
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses route with body (per-route overrides)", async () => {
    const project = await expectParses(`
      route planner -> anthropic.claude_code { mode = cli }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses fallback declaration", async () => {
    const project = await expectParses(`
      fallback -> cerebras.glm_4_7
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses multiple routes including resolver", async () => {
    const project = await expectParses(`
      route planner   -> anthropic.claude_code
      route generator -> openai.codex
      route resolver  -> cerebras.glm_4_7
      fallback        -> cerebras.glm_4_7
    `);
    expect(project.declarations).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run the test and verify FAIL**

```bash
pnpm --filter @vibe/language test test/primitives/route.test.ts
```

Expected: 4 failures — the placeholder route rule doesn't accept dotted-id targets, bodies, or the `fallback` keyword.

- [ ] **Step 3: Grow the grammar — replace the placeholder Route rule**

In `packages/language/src/vibe.langium`:

1. Replace `Route` and add `Fallback` to `Declaration`:

```text
Declaration:
    Agent | Route | Fallback | Persona | Provider;

Route:
    'route' from=ID '->' to=QualifiedName ('{' fields+=Field* '}')?;

Fallback:
    'fallback' '->' to=QualifiedName ('{' fields+=Field* '}')?;
```

- [ ] **Step 4: Regenerate the AST and run the tests**

```bash
pnpm --filter @vibe/language langium:generate
pnpm --filter @vibe/language test test/primitives/route.test.ts
```

Expected: `Tests  4 passed`. The smoke test (which used `route planner -> worker` where `worker` was an ID) should still pass — `QualifiedName` is a superset.

- [ ] **Step 5: Run the full test suite**

```bash
pnpm --filter @vibe/language test
```

Expected: `Tests  31 passed` (27 prior + 4 new).

- [ ] **Step 6: Commit**

```bash
git -C c:/Hive/vibe add packages/language/src/vibe.langium packages/language/test/primitives/route.test.ts
git -C c:/Hive/vibe commit -m "feat(language): full route + fallback primitive surface"
```

---

## Task 9: `persona` primitive — extend with full field set

Persona already parses via the literal expression task. Extend tests to cover the full surface from spec §2.5.

**Files:**
- Create: `c:/Hive/vibe/packages/language/test/primitives/persona.test.ts`

- [ ] **Step 1: Write the failing test (most pass — verifying composite usage)**

Write `c:/Hive/vibe/packages/language/test/primitives/persona.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { expectParses } from "../parse-helper.js";

describe("persona primitive", () => {
  it("parses persona with minimal description", async () => {
    const project = await expectParses(`
      persona izsha_voice { description = "coordinator, dry" }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses persona with full optional fields", async () => {
    const project = await expectParses(`
      persona izsha_voice {
        description = "coordinator, dry, pushes back on speculative work"
        pushback    = high
        uncertainty = explicit
        verbosity   = terse
      }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses multiple persona declarations", async () => {
    const project = await expectParses(`
      persona izsha_voice { description = "coordinator, dry" }
      persona scout_voice { description = "fast scout, terse" }
    `);
    expect(project.declarations).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm --filter @vibe/language test test/primitives/persona.test.ts
```

Expected: `Tests  3 passed`. If any fail, the grammar's Persona rule doesn't accept what spec §2.5 promised — re-check Field accepts identifier-as-value (`pushback = high` where `high` is a bare identifier referencing nothing, parsed as a single-segment Reference).

- [ ] **Step 3: Commit**

```bash
git -C c:/Hive/vibe add packages/language/test/primitives/persona.test.ts
git -C c:/Hive/vibe commit -m "test(language): persona primitive full field set"
```

---

## Task 10: `memory` primitive

**Files:**
- Modify: `c:/Hive/vibe/packages/language/src/vibe.langium`
- Create: `c:/Hive/vibe/packages/language/test/primitives/memory.test.ts`

- [ ] **Step 1: Write the failing test**

Write `c:/Hive/vibe/packages/language/test/primitives/memory.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { expectParses } from "../parse-helper.js";

describe("memory primitive", () => {
  it("parses minimal memory binding", async () => {
    const project = await expectParses(`
      memory izsha_global {
        kind      = spineflow
        namespace = "izsha.global"
      }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses memory binding with on_load reference", async () => {
    const project = await expectParses(`
      memory izsha_global {
        kind      = spineflow
        namespace = "izsha.global"
        on_load   = recall_recent
      }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses memory binding with fog threshold", async () => {
    const project = await expectParses(`
      memory izsha_global {
        kind          = spineflow
        namespace     = "izsha.global"
        fog_threshold = medium
      }
    `);
    expect(project.declarations).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test and verify FAIL**

```bash
pnpm --filter @vibe/language test test/primitives/memory.test.ts
```

Expected: 3 failures — `memory` keyword not in grammar.

- [ ] **Step 3: Grow the grammar — add `Memory` declaration**

In `packages/language/src/vibe.langium`:

```text
Declaration:
    Agent | Route | Fallback | Persona | Provider | Memory;

Memory:
    'memory' name=ID '{' fields+=Field* '}';
```

- [ ] **Step 4: Regenerate and run**

```bash
pnpm --filter @vibe/language langium:generate
pnpm --filter @vibe/language test test/primitives/memory.test.ts
```

Expected: `Tests  3 passed`.

- [ ] **Step 5: Full suite**

```bash
pnpm --filter @vibe/language test
```

Expected: `Tests  37 passed` (34 prior + 3 new).

- [ ] **Step 6: Commit**

```bash
git -C c:/Hive/vibe add packages/language/src/vibe.langium packages/language/test/primitives/memory.test.ts
git -C c:/Hive/vibe commit -m "feat(language): memory primitive"
```

---

## Task 11: `harness` primitive

**Files:**
- Modify: `c:/Hive/vibe/packages/language/src/vibe.langium`
- Create: `c:/Hive/vibe/packages/language/test/primitives/harness.test.ts`

- [ ] **Step 1: Write the failing test**

Write `c:/Hive/vibe/packages/language/test/primitives/harness.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { expectParses } from "../parse-helper.js";

describe("harness primitive", () => {
  it("parses planner-generator-evaluator harness", async () => {
    const project = await expectParses(`
      harness asset_drain { kind = planner_generator_evaluator }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses brain-hands-session harness", async () => {
    const project = await expectParses(`
      harness fast_loop { kind = brain_hands_session }
    `);
    expect(project.declarations).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test and verify FAIL**

```bash
pnpm --filter @vibe/language test test/primitives/harness.test.ts
```

Expected: 2 failures.

- [ ] **Step 3: Grow the grammar — add `Harness` declaration**

In `packages/language/src/vibe.langium`:

```text
Declaration:
    Agent | Route | Fallback | Persona | Provider | Memory | Harness;

Harness:
    'harness' name=ID '{' fields+=Field* '}';
```

- [ ] **Step 4: Regenerate and run**

```bash
pnpm --filter @vibe/language langium:generate
pnpm --filter @vibe/language test test/primitives/harness.test.ts
```

Expected: `Tests  2 passed`.

- [ ] **Step 5: Full suite**

```bash
pnpm --filter @vibe/language test
```

Expected: `Tests  39 passed`.

- [ ] **Step 6: Commit**

```bash
git -C c:/Hive/vibe add packages/language/src/vibe.langium packages/language/test/primitives/harness.test.ts
git -C c:/Hive/vibe commit -m "feat(language): harness primitive"
```

---

## Task 12: `plugin` primitive

**Files:**
- Modify: `c:/Hive/vibe/packages/language/src/vibe.langium`
- Create: `c:/Hive/vibe/packages/language/test/primitives/plugin.test.ts`

- [ ] **Step 1: Write the failing test**

Write `c:/Hive/vibe/packages/language/test/primitives/plugin.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { expectParses } from "../parse-helper.js";

describe("plugin primitive", () => {
  it("parses plugin with impl path", async () => {
    const project = await expectParses(`
      plugin asset_pipeline {
        impl = "./plugins/asset-pipeline/index.ts"
      }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses plugin with version field", async () => {
    const project = await expectParses(`
      plugin asset_pipeline {
        impl    = "./plugins/asset-pipeline/index.ts"
        version = "0.1.0"
      }
    `);
    expect(project.declarations).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test and verify FAIL**

```bash
pnpm --filter @vibe/language test test/primitives/plugin.test.ts
```

Expected: 2 failures.

- [ ] **Step 3: Grow the grammar — add `Plugin` declaration**

In `packages/language/src/vibe.langium`:

```text
Declaration:
    Agent | Route | Fallback | Persona | Provider | Memory | Harness | Plugin;

Plugin:
    'plugin' name=ID '{' fields+=Field* '}';
```

- [ ] **Step 4: Regenerate and run**

```bash
pnpm --filter @vibe/language langium:generate
pnpm --filter @vibe/language test test/primitives/plugin.test.ts
```

Expected: `Tests  2 passed`.

- [ ] **Step 5: Full suite**

```bash
pnpm --filter @vibe/language test
```

Expected: `Tests  41 passed`.

- [ ] **Step 6: Commit**

```bash
git -C c:/Hive/vibe add packages/language/src/vibe.langium packages/language/test/primitives/plugin.test.ts
git -C c:/Hive/vibe commit -m "feat(language): plugin primitive"
```

---

## Task 13: `trigger` primitive (cron + event)

Triggers have two flavors: `trigger every "1h" { ... }` and `trigger on "event_name" { ... }`.

**Files:**
- Modify: `c:/Hive/vibe/packages/language/src/vibe.langium`
- Create: `c:/Hive/vibe/packages/language/test/primitives/trigger.test.ts`

- [ ] **Step 1: Write the failing test**

Write `c:/Hive/vibe/packages/language/test/primitives/trigger.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { expectParses } from "../parse-helper.js";

describe("trigger primitive", () => {
  it("parses cron-style trigger with interval string", async () => {
    const project = await expectParses(`
      trigger every "1h" { do = plugin.asset_pipeline.health_check }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses trigger with sub-hour interval", async () => {
    const project = await expectParses(`
      trigger every "30m" { do = plugin.asset_pipeline.health_check }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses event-driven trigger", async () => {
    const project = await expectParses(`
      trigger on "asset_pipeline.promoted" {
        do = plugin.asset_pipeline.update_manifest
      }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses trigger with when guard", async () => {
    const project = await expectParses(`
      trigger every "1h" {
        do   = plugin.asset_pipeline.health_check
        when = "always"
      }
    `);
    expect(project.declarations).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test and verify FAIL**

```bash
pnpm --filter @vibe/language test test/primitives/trigger.test.ts
```

Expected: 4 failures.

- [ ] **Step 3: Grow the grammar — add `Trigger` declaration**

In `packages/language/src/vibe.langium`:

```text
Declaration:
    Agent | Route | Fallback | Persona | Provider | Memory | Harness | Plugin | Trigger;

Trigger:
    'trigger' kind=('every' | 'on') schedule=STRING '{' fields+=Field* '}';
```

- [ ] **Step 4: Regenerate and run**

```bash
pnpm --filter @vibe/language langium:generate
pnpm --filter @vibe/language test test/primitives/trigger.test.ts
```

Expected: `Tests  4 passed`.

- [ ] **Step 5: Full suite**

```bash
pnpm --filter @vibe/language test
```

Expected: `Tests  45 passed`.

- [ ] **Step 6: Commit**

```bash
git -C c:/Hive/vibe add packages/language/src/vibe.langium packages/language/test/primitives/trigger.test.ts
git -C c:/Hive/vibe commit -m "feat(language): trigger primitive (cron + event variants)"
```

---

## Task 14: `agent` primitive — full surface

The placeholder agent rule is `agent name {}`. Replace with the full surface from spec §2.9: persona, memory, harness, uses, routes fields all optional except `uses`.

**Files:**
- Modify: `c:/Hive/vibe/packages/language/src/vibe.langium`
- Create: `c:/Hive/vibe/packages/language/test/primitives/agent.test.ts`

- [ ] **Step 1: Write the failing test**

Write `c:/Hive/vibe/packages/language/test/primitives/agent.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { expectParses } from "../parse-helper.js";

describe("agent primitive", () => {
  it("parses minimal agent with uses only", async () => {
    const project = await expectParses(`
      agent izsha { uses = [plugin.asset_pipeline] }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses agent with persona + memory + harness", async () => {
    const project = await expectParses(`
      agent izsha {
        persona = persona.izsha_voice
        memory  = memory.izsha_global
        harness = harness.asset_drain
        uses    = [plugin.asset_pipeline]
      }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses agent with per-agent route overrides", async () => {
    const project = await expectParses(`
      agent izsha {
        uses   = [plugin.asset_pipeline]
        routes = {
          planner   = route.planner
          generator = route.generator
          resolver  = route.resolver
        }
      }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses agent with multiple plugins", async () => {
    const project = await expectParses(`
      agent izsha {
        uses = [plugin.asset_pipeline, plugin.deploy, plugin.life]
      }
    `);
    expect(project.declarations).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test and verify FAIL**

```bash
pnpm --filter @vibe/language test test/primitives/agent.test.ts
```

Expected: 4 failures — placeholder Agent rule is body-less.

- [ ] **Step 3: Replace the placeholder Agent rule**

In `packages/language/src/vibe.langium`, replace:

```text
Agent:
    'agent' name=ID '{' '}';
```

with:

```text
Agent:
    'agent' name=ID '{' fields+=Field* '}';
```

- [ ] **Step 4: Regenerate and run**

```bash
pnpm --filter @vibe/language langium:generate
pnpm --filter @vibe/language test test/primitives/agent.test.ts
```

Expected: `Tests  4 passed`.

- [ ] **Step 5: Full suite**

```bash
pnpm --filter @vibe/language test
```

Expected: `Tests  49 passed`. Smoke test (`agent planner {}`) still passes because `fields+=Field*` allows zero fields.

- [ ] **Step 6: Commit**

```bash
git -C c:/Hive/vibe add packages/language/src/vibe.langium packages/language/test/primitives/agent.test.ts
git -C c:/Hive/vibe commit -m "feat(language): agent primitive with full field surface"
```

---

## Task 15: Validator — duplicate declarations

A project that declares two agents with the same name should produce a validator error. Same for two providers, two routes for the same logical name, etc.

**Files:**
- Create: `c:/Hive/vibe/packages/language/src/vibe-validator.ts`
- Modify: `c:/Hive/vibe/packages/language/src/vibe-module.ts`
- Create: `c:/Hive/vibe/packages/language/test/validators/duplicate-declarations.test.ts`

- [ ] **Step 1: Write the failing test**

Write `c:/Hive/vibe/packages/language/test/validators/duplicate-declarations.test.ts`:

```typescript
import { EmptyFileSystem } from "langium";
import { describe, expect, it } from "vitest";
import { createVibeServices } from "../../src/vibe-module.js";
import { parseVibe } from "../parse-helper.js";

describe("duplicate declaration validator", () => {
  it("reports two agents with the same name", async () => {
    const services = createVibeServices(EmptyFileSystem).Vibe;
    const document = await parseVibe(`
      agent izsha { uses = [plugin.x] }
      agent izsha { uses = [plugin.y] }
    `);
    await services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });
    const messages = document.diagnostics?.map((d) => d.message) ?? [];
    expect(messages.some((m) => /duplicate.*agent.*izsha/i.test(m))).toBe(true);
  });

  it("reports two providers with the same qualified name", async () => {
    const services = createVibeServices(EmptyFileSystem).Vibe;
    const document = await parseVibe(`
      provider cerebras.glm_4_7 { mode = api }
      provider cerebras.glm_4_7 { mode = api }
    `);
    await services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });
    const messages = document.diagnostics?.map((d) => d.message) ?? [];
    expect(messages.some((m) => /duplicate.*provider/i.test(m))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify FAIL**

```bash
pnpm --filter @vibe/language test test/validators/duplicate-declarations.test.ts
```

Expected: 2 failures — no validator registered yet.

- [ ] **Step 3: Create the validator file**

Write `c:/Hive/vibe/packages/language/src/vibe-validator.ts`:

```typescript
import type { ValidationAcceptor, ValidationChecks } from "langium";
import type {
  Agent,
  Project,
  Provider,
  VibeAstType,
} from "./generated/ast.js";

export function registerValidationChecks(services: {
  validation: { ValidationRegistry: { register(checks: ValidationChecks<VibeAstType>, validator: VibeValidator): void } };
}): void {
  const registry = services.validation.ValidationRegistry;
  const validator = new VibeValidator();
  const checks: ValidationChecks<VibeAstType> = {
    Project: validator.checkDuplicateDeclarations,
  };
  registry.register(checks, validator);
}

export class VibeValidator {
  checkDuplicateDeclarations(project: Project, accept: ValidationAcceptor): void {
    const agentNames = new Map<string, Agent[]>();
    const providerNames = new Map<string, Provider[]>();

    for (const decl of project.declarations) {
      if (decl.$type === "Agent") {
        const key = decl.name;
        const arr = agentNames.get(key) ?? [];
        arr.push(decl);
        agentNames.set(key, arr);
      } else if (decl.$type === "Provider") {
        const key = decl.name.segments.join(".");
        const arr = providerNames.get(key) ?? [];
        arr.push(decl);
        providerNames.set(key, arr);
      }
    }

    for (const [name, agents] of agentNames) {
      if (agents.length > 1) {
        for (const agent of agents) {
          accept("error", `Duplicate agent declaration: ${name}`, {
            node: agent,
            property: "name",
          });
        }
      }
    }

    for (const [name, providers] of providerNames) {
      if (providers.length > 1) {
        for (const provider of providers) {
          accept("error", `Duplicate provider declaration: ${name}`, {
            node: provider,
            property: "name",
          });
        }
      }
    }
  }
}
```

- [ ] **Step 4: Wire the validator into the Vibe service module**

Modify `c:/Hive/vibe/packages/language/src/vibe-module.ts`. Find the section where the services container is created (look for `inject(...)` after the comment "Declaration of custom services") and add a call to `registerValidationChecks(services)` after the services are constructed.

Locate the existing `createVibeServices` function and modify the end so it looks like:

```typescript
import { registerValidationChecks } from "./vibe-validator.js";

// ... existing code ...

export function createVibeServices(context: DefaultSharedModuleContext): {
  shared: LangiumSharedServices;
  Vibe: VibeServices;
} {
  const shared = inject(
    createDefaultSharedModule(context),
    VibeGeneratedSharedModule,
  );
  const Vibe = inject(
    createDefaultModule({ shared }),
    VibeGeneratedModule,
    VibeModule,
  );
  shared.ServiceRegistry.register(Vibe);
  registerValidationChecks(Vibe);
  return { shared, Vibe };
}
```

(If the existing function shape differs, adapt — what matters is calling `registerValidationChecks(Vibe)` once the Vibe services container is built.)

- [ ] **Step 5: Regenerate and run the test**

```bash
pnpm --filter @vibe/language langium:generate
pnpm --filter @vibe/language test test/validators/duplicate-declarations.test.ts
```

Expected: `Tests  2 passed`. If the diagnostic isn't appearing, verify `DocumentBuilder.build` is being called with `validation: true` and that the validator was registered.

- [ ] **Step 6: Full suite**

```bash
pnpm --filter @vibe/language test
```

Expected: `Tests  51 passed`.

- [ ] **Step 7: Commit**

```bash
git -C c:/Hive/vibe add packages/language/src/vibe-validator.ts packages/language/src/vibe-module.ts packages/language/test/validators/duplicate-declarations.test.ts
git -C c:/Hive/vibe commit -m "feat(language): duplicate-declaration validator (agent, provider)"
```

---

## Task 16: Validator — reserved route name (`resolver` required)

Spec §2.2 requires every project to declare `route resolver -> X`. The validator should flag the absence.

**Files:**
- Modify: `c:/Hive/vibe/packages/language/src/vibe-validator.ts`
- Create: `c:/Hive/vibe/packages/language/test/validators/reserved-routes.test.ts`

- [ ] **Step 1: Write the failing test**

Write `c:/Hive/vibe/packages/language/test/validators/reserved-routes.test.ts`:

```typescript
import { EmptyFileSystem } from "langium";
import { describe, expect, it } from "vitest";
import { createVibeServices } from "../../src/vibe-module.js";
import { parseVibe } from "../parse-helper.js";

describe("reserved route validator", () => {
  it("reports missing `resolver` route", async () => {
    const services = createVibeServices(EmptyFileSystem).Vibe;
    const document = await parseVibe(`
      provider cerebras.glm_4_7 { mode = api }
      route planner -> cerebras.glm_4_7
    `);
    await services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });
    const messages = document.diagnostics?.map((d) => d.message) ?? [];
    expect(messages.some((m) => /resolver.*required/i.test(m))).toBe(true);
  });

  it("accepts a project that declares resolver", async () => {
    const services = createVibeServices(EmptyFileSystem).Vibe;
    const document = await parseVibe(`
      provider cerebras.glm_4_7 { mode = api }
      route resolver -> cerebras.glm_4_7
    `);
    await services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });
    const errors = (document.diagnostics ?? []).filter((d) => d.severity === 1);
    expect(errors).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test and verify the first one fails**

```bash
pnpm --filter @vibe/language test test/validators/reserved-routes.test.ts
```

Expected: 1 failure (resolver-missing case), 1 pass (resolver-present case).

- [ ] **Step 3: Extend the validator**

Modify `c:/Hive/vibe/packages/language/src/vibe-validator.ts`. Add a new check method on `VibeValidator`:

```typescript
checkResolverRoute(project: Project, accept: ValidationAcceptor): void {
  const hasResolver = project.declarations.some(
    (d) => d.$type === "Route" && d.from === "resolver",
  );
  if (!hasResolver) {
    accept(
      "error",
      "Missing required route `resolver`. Every Vibe project must declare `route resolver -> <provider>`.",
      { node: project },
    );
  }
}
```

And register it in the `checks` object inside `registerValidationChecks`:

```typescript
const checks: ValidationChecks<VibeAstType> = {
  Project: [
    validator.checkDuplicateDeclarations,
    validator.checkResolverRoute,
  ],
};
```

- [ ] **Step 4: Run the test**

```bash
pnpm --filter @vibe/language test test/validators/reserved-routes.test.ts
```

Expected: `Tests  2 passed`.

- [ ] **Step 5: Full suite — note that the duplicate-declarations test no longer satisfies the resolver requirement**

```bash
pnpm --filter @vibe/language test
```

Existing duplicate-declaration tests don't declare resolver, so they now produce an extra diagnostic. That's fine — those tests assert on the duplicate message; the resolver-missing diagnostic doesn't break them. But verify with:

```bash
pnpm --filter @vibe/language test test/validators/duplicate-declarations.test.ts
```

If they fail because of the new error, add `route resolver -> cerebras.glm_4_7` to those test sources. Re-run.

- [ ] **Step 6: Full suite passes**

```bash
pnpm --filter @vibe/language test
```

Expected: `Tests  53 passed` (51 prior + 2 new).

- [ ] **Step 7: Commit**

```bash
git -C c:/Hive/vibe add packages/language/src/vibe-validator.ts packages/language/test/validators/reserved-routes.test.ts packages/language/test/validators/duplicate-declarations.test.ts
git -C c:/Hive/vibe commit -m "feat(language): require `route resolver -> ...` declaration"
```

---

## Task 17: Validator — cross-references resolve to declared things

`agent X { uses = [plugin.y] }` is only valid if `plugin y` was declared somewhere. Same for `route X -> Y` requiring `provider Y` (when Y is a provider QualifiedName), `persona = persona.X` requiring `persona X`, etc.

This validator catches the most common authoring error. v0 keeps the rule list small:

- Every `plugin.<name>` reference in an `Expression` must resolve to a declared `Plugin`.
- Every `provider.<name>` reference must resolve to a declared `Provider`.
- Every `route.<name>` reference must resolve to a declared `Route`.
- Every `persona.<name>` reference must resolve to a declared `Persona`.
- Every `memory.<name>` reference must resolve to a declared `Memory`.
- Every `harness.<name>` reference must resolve to a declared `Harness`.

**Files:**
- Modify: `c:/Hive/vibe/packages/language/src/vibe-validator.ts`
- Create: `c:/Hive/vibe/packages/language/test/validators/cross-references.test.ts`

- [ ] **Step 1: Write the failing test**

Write `c:/Hive/vibe/packages/language/test/validators/cross-references.test.ts`:

```typescript
import { EmptyFileSystem } from "langium";
import { describe, expect, it } from "vitest";
import { createVibeServices } from "../../src/vibe-module.js";
import { parseVibe } from "../parse-helper.js";

describe("cross-reference validator", () => {
  it("reports `plugin.x` reference when no plugin x is declared", async () => {
    const services = createVibeServices(EmptyFileSystem).Vibe;
    const document = await parseVibe(`
      provider cerebras.glm_4_7 { mode = api }
      route resolver -> cerebras.glm_4_7
      agent izsha { uses = [plugin.missing_plugin] }
    `);
    await services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });
    const messages = document.diagnostics?.map((d) => d.message) ?? [];
    expect(messages.some((m) => /missing_plugin.*not declared/i.test(m))).toBe(true);
  });

  it("accepts a fully-resolved reference graph", async () => {
    const services = createVibeServices(EmptyFileSystem).Vibe;
    const document = await parseVibe(`
      provider cerebras.glm_4_7 { mode = api }
      route resolver -> cerebras.glm_4_7

      plugin asset_pipeline { impl = "./plugins/asset-pipeline/index.ts" }
      persona izsha_voice { description = "coordinator, dry" }
      memory izsha_global { kind = spineflow, namespace = "izsha.global" }
      harness asset_drain { kind = planner_generator_evaluator }

      agent izsha {
        persona = persona.izsha_voice
        memory  = memory.izsha_global
        harness = harness.asset_drain
        uses    = [plugin.asset_pipeline]
      }
    `);
    await services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });
    const errors = (document.diagnostics ?? []).filter((d) => d.severity === 1);
    expect(errors).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test and verify the first fails**

```bash
pnpm --filter @vibe/language test test/validators/cross-references.test.ts
```

Expected: 1 failure, 1 pass.

- [ ] **Step 3: Extend the validator**

Modify `c:/Hive/vibe/packages/language/src/vibe-validator.ts`. Add a check that walks every Reference in the project's expressions and verifies dotted references with known prefixes resolve:

```typescript
import type { Reference as VibeReference } from "./generated/ast.js";

// ...inside VibeValidator class:

checkCrossReferences(project: Project, accept: ValidationAcceptor): void {
  const declared = {
    plugin: new Set<string>(),
    persona: new Set<string>(),
    memory: new Set<string>(),
    harness: new Set<string>(),
    route: new Set<string>(),
    provider: new Set<string>(),
  };
  for (const decl of project.declarations) {
    switch (decl.$type) {
      case "Plugin":   declared.plugin.add(decl.name); break;
      case "Persona":  declared.persona.add(decl.name); break;
      case "Memory":   declared.memory.add(decl.name); break;
      case "Harness":  declared.harness.add(decl.name); break;
      case "Route":    declared.route.add(decl.from); break;
      case "Provider": declared.provider.add(decl.name.segments.join(".")); break;
    }
  }

  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    if ((node as { $type?: string }).$type === "Reference") {
      const ref = node as VibeReference;
      const head = ref.segments[0];
      const tail = ref.segments[1];
      if (head && tail && head in declared && !declared[head as keyof typeof declared].has(tail)) {
        accept(
          "error",
          `\`${head}.${tail}\` is not declared in this project.`,
          { node: ref },
        );
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const item of value) walk(item);
      } else {
        walk(value);
      }
    }
  };

  walk(project);
}
```

Register the new check inside `registerValidationChecks`:

```typescript
const checks: ValidationChecks<VibeAstType> = {
  Project: [
    validator.checkDuplicateDeclarations,
    validator.checkResolverRoute,
    validator.checkCrossReferences,
  ],
};
```

- [ ] **Step 4: Run the test**

```bash
pnpm --filter @vibe/language test test/validators/cross-references.test.ts
```

Expected: `Tests  2 passed`.

- [ ] **Step 5: Full suite**

```bash
pnpm --filter @vibe/language test
```

Expected: `Tests  55 passed` (53 prior + 2 new).

- [ ] **Step 6: Commit**

```bash
git -C c:/Hive/vibe add packages/language/src/vibe-validator.ts packages/language/test/validators/cross-references.test.ts
git -C c:/Hive/vibe commit -m "feat(language): cross-reference validator (plugin/persona/memory/harness/route/provider)"
```

---

## Task 18: Example files (one per primitive + composite)

Each primitive gets a runnable example. The composite example matches the spec §2 canonical project illustration.

**Files:**
- Create: `c:/Hive/vibe/examples/01-provider.vibe`
- Create: `c:/Hive/vibe/examples/02-route.vibe`
- Create: `c:/Hive/vibe/examples/03-plugin.vibe`
- Create: `c:/Hive/vibe/examples/04-persona.vibe`
- Create: `c:/Hive/vibe/examples/05-memory.vibe`
- Create: `c:/Hive/vibe/examples/06-harness.vibe`
- Create: `c:/Hive/vibe/examples/07-trigger.vibe`
- Create: `c:/Hive/vibe/examples/08-agent.vibe`
- Create: `c:/Hive/vibe/examples/09-project.vibe`
- Delete: `c:/Hive/vibe/examples/hello.vibe`

- [ ] **Step 1: Create each per-primitive example**

Write `c:/Hive/vibe/examples/01-provider.vibe`:

```text
// Provider declarations. Two modes: api (HTTPS) and cli (local subprocess).

provider cerebras.glm_4_7 {
  mode  = api
  model = "glm-4.7"
}

provider anthropic.claude_code {
  mode      = cli
  binary    = "claude"
  lifecycle = long_lived
}

route resolver -> cerebras.glm_4_7
```

Write `c:/Hive/vibe/examples/02-route.vibe`:

```text
// Routes map logical work-names to providers. `resolver` is required.

provider cerebras.glm_4_7      { mode = api }
provider anthropic.claude_code { mode = cli }
provider openai.codex          { mode = cli }

route resolver  -> cerebras.glm_4_7
route planner   -> anthropic.claude_code
route generator -> openai.codex
fallback        -> cerebras.glm_4_7
```

Write `c:/Hive/vibe/examples/03-plugin.vibe`:

```text
// A plugin declaration points at a TS module that exports a definePlugin() result.

provider cerebras.glm_4_7 { mode = api }
route resolver -> cerebras.glm_4_7

plugin asset_pipeline {
  impl    = "./plugins/asset-pipeline/index.ts"
  version = "0.1.0"
}
```

Write `c:/Hive/vibe/examples/04-persona.vibe`:

```text
// Personas describe the voice / behavior profile referenceable by agents.

provider cerebras.glm_4_7 { mode = api }
route resolver -> cerebras.glm_4_7

persona izsha_voice {
  description = "coordinator, dry, pushes back on speculative work"
  pushback    = high
  uncertainty = explicit
  verbosity   = terse
}
```

Write `c:/Hive/vibe/examples/05-memory.vibe`:

```text
// Memory bindings connect logical names to Spineflow namespaces.

provider cerebras.glm_4_7 { mode = api }
route resolver -> cerebras.glm_4_7

memory izsha_global {
  kind          = spineflow
  namespace     = "izsha.global"
  fog_threshold = medium
}
```

Write `c:/Hive/vibe/examples/06-harness.vibe`:

```text
// Harnesses cite the Anthropic + Brain/Hands/Session patterns from Phase 0 research.

provider cerebras.glm_4_7 { mode = api }
route resolver -> cerebras.glm_4_7

harness asset_drain {
  kind = planner_generator_evaluator
}

harness fast_loop {
  kind = brain_hands_session
}
```

Write `c:/Hive/vibe/examples/07-trigger.vibe`:

```text
// Triggers are scheduled (every) or event-driven (on).

provider cerebras.glm_4_7 { mode = api }
route resolver -> cerebras.glm_4_7

plugin asset_pipeline { impl = "./plugins/asset-pipeline/index.ts" }

trigger every "1h" {
  do = plugin.asset_pipeline.health_check
}

trigger on "asset_pipeline.promoted" {
  do = plugin.asset_pipeline.update_manifest
}
```

Write `c:/Hive/vibe/examples/08-agent.vibe`:

```text
// A full agent declaration composes persona, memory, harness, and plugins.

provider cerebras.glm_4_7 { mode = api }
route resolver -> cerebras.glm_4_7

plugin asset_pipeline { impl = "./plugins/asset-pipeline/index.ts" }
persona izsha_voice { description = "coordinator, dry" }
memory  izsha_global { kind = spineflow, namespace = "izsha.global" }
harness asset_drain { kind = planner_generator_evaluator }

agent izsha {
  persona = persona.izsha_voice
  memory  = memory.izsha_global
  harness = harness.asset_drain
  uses    = [plugin.asset_pipeline]
}
```

Write `c:/Hive/vibe/examples/09-project.vibe`:

```text
// Canonical Vibe v0 project — every primitive used in one file.

provider anthropic.claude_code { mode = cli }
provider openai.codex          { mode = cli }
provider cerebras.glm_4_7      { mode = api }
provider google.gemini         { mode = cli }
provider xai.grok              { mode = api }    // api-only; no Grok CLI in May 2026

route planner   -> anthropic.claude_code
route generator -> openai.codex
route resolver  -> cerebras.glm_4_7
route grep      -> cerebras.glm_4_7
fallback        -> cerebras.glm_4_7

plugin asset_pipeline {
  impl = "./plugins/asset-pipeline/index.ts"
}

persona izsha_voice {
  description = "coordinator, dry, pushes back on speculative work"
}

memory izsha_global {
  kind          = spineflow
  namespace     = "izsha.global"
  fog_threshold = medium
}

harness asset_drain {
  kind = planner_generator_evaluator
}

agent izsha {
  persona = persona.izsha_voice
  memory  = memory.izsha_global
  harness = harness.asset_drain
  uses    = [plugin.asset_pipeline]
}

trigger every "1h" {
  do = plugin.asset_pipeline.health_check
}
```

- [ ] **Step 2: Delete the placeholder example**

```bash
rm c:/Hive/vibe/examples/hello.vibe
```

- [ ] **Step 3: Commit**

```bash
git -C c:/Hive/vibe add examples/
git -C c:/Hive/vibe commit -m "examples(language): one .vibe per primitive + canonical 09-project.vibe"
```

---

## Task 19: Integration test — every example parses and validates

Run every file in `examples/` through the parser AND validator. Catches drift between spec, grammar, and examples.

**Files:**
- Create: `c:/Hive/vibe/packages/language/test/integration/canonical-project.test.ts`

- [ ] **Step 1: Write the failing-or-passing integration test**

Write `c:/Hive/vibe/packages/language/test/integration/canonical-project.test.ts`:

```typescript
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { EmptyFileSystem } from "langium";
import { describe, expect, it } from "vitest";
import { createVibeServices } from "../../src/vibe-module.js";
import { parseVibe } from "../parse-helper.js";

const examplesDir = resolve(__dirname, "../../../../examples");

describe("examples/ integration", () => {
  const files = readdirSync(examplesDir).filter((f) => f.endsWith(".vibe"));

  for (const file of files) {
    it(`parses and validates ${file} with zero errors`, async () => {
      const source = readFileSync(join(examplesDir, file), "utf8");
      const services = createVibeServices(EmptyFileSystem).Vibe;
      const document = await parseVibe(source);

      const parseErrors = document.parseResult.lexerErrors.concat(
        document.parseResult.parserErrors,
      );
      expect(parseErrors, `parse errors in ${file}`).toHaveLength(0);

      await services.shared.workspace.DocumentBuilder.build([document], {
        validation: true,
      });
      const validationErrors = (document.diagnostics ?? []).filter(
        (d) => d.severity === 1,
      );
      expect(
        validationErrors,
        `validation errors in ${file}: ${validationErrors.map((e) => e.message).join("; ")}`,
      ).toHaveLength(0);
    });
  }
});
```

- [ ] **Step 2: Run the integration tests**

```bash
pnpm --filter @vibe/language test test/integration/canonical-project.test.ts
```

Expected: 9 passes (one per file in `examples/`). If any fail, the example file violates a validator rule — fix the example to satisfy the rule, OR refine the validator if it's overzealous.

- [ ] **Step 3: Full suite**

```bash
pnpm --filter @vibe/language test
```

Expected: `Tests  64 passed` (55 prior + 9 new).

- [ ] **Step 4: Commit**

```bash
git -C c:/Hive/vibe add packages/language/test/integration/canonical-project.test.ts
git -C c:/Hive/vibe commit -m "test(language): integration test — every example parses + validates"
```

---

## Task 20: Update language package README + final lint

Document the surface that SD1 produced. Confirm the build is still clean.

**Files:**
- Modify: `c:/Hive/vibe/packages/language/README.md`

- [ ] **Step 1: Replace the README with real content**

Write `c:/Hive/vibe/packages/language/README.md`:

```markdown
# @vibe/language

Parser, AST, evaluator (forthcoming), and Langium-powered LSP for the [Vibe](../..) v0 specification language.

## Status

**v0 SD1 (Language)** — complete. Grammar covers all 9 primitives (`agent`, `plugin`, `tool` as reference path, `route`, `provider`, `persona`, `memory`, `trigger`, `harness`), all expression types (literals, references, collections, optional type annotations), and three validators (duplicate declarations, required `resolver` route, cross-reference resolution).

**Not yet shipping:** the evaluator (SD2), LLM resolver (SD2), `vibe init` analysis pipeline (SD3). See [`../../docs/superpowers/specs/2026-05-13-vibe-language-v0.md`](../../docs/superpowers/specs/2026-05-13-vibe-language-v0.md).

## Commands

```bash
pnpm --filter @vibe/language langium:generate   # regenerate parser/AST from src/vibe.langium
pnpm --filter @vibe/language build              # generate + tsc
pnpm --filter @vibe/language test               # run Vitest test suite
pnpm --filter @vibe/language test:watch         # watch mode
```

## Examples

See [`../../examples`](../../examples) for one `.vibe` file per primitive plus a composite project example. Every example parses and validates as part of the test suite.

## Grammar surface

Defined in [`src/vibe.langium`](src/vibe.langium). Quick reference:

- **Top-level declarations:** `agent`, `route`, `fallback`, `persona`, `provider`, `memory`, `harness`, `plugin`, `trigger`.
- **Expressions:** string / number / boolean / null literals, references (single or dotted), list `[...]`, object `{ key = value, ... }`.
- **Optional type annotation:** `key : Type = expression`. Parsed but not statically enforced (gradual typing — runtime check only).
- **Comments:** `//` line and `/* ... */` block.
```

- [ ] **Step 2: Run a final clean build + test**

```bash
pnpm --filter @vibe/language clean
pnpm --filter @vibe/language build
pnpm --filter @vibe/language test
```

Expected: `tsc` exits 0, all 64 tests pass.

- [ ] **Step 3: Commit**

```bash
git -C c:/Hive/vibe add packages/language/README.md
git -C c:/Hive/vibe commit -m "docs(language): README documents the SD1 surface"
```

---

## Task 21: Final SD1 sanity — verify VS Code extension still loads the LSP

The VS Code extension's LSP wire (`packages/vscode-extension/src/extension.ts`) imports `@vibe/language`'s `language-server.js`. The grammar growth shouldn't have broken that, but verify.

**Files:**
- No file changes. Manual verification.

- [ ] **Step 1: Build everything from the root**

```bash
pnpm -r build
```

Expected: both packages build clean. If `vscode-extension` fails to build, the language server export shape changed — check `packages/language/src/index.ts` re-exports.

- [ ] **Step 2: Manually verify the LSP starts in VS Code (optional)**

This step is *manual* and can be skipped if you're running headless. Open `c:/Hive/vibe` in VS Code, open `examples/09-project.vibe`. Verify:

- Syntax highlighting shows on `agent`, `route`, `provider`, etc. keywords.
- Hovering over a declaration name produces no errors in the LSP output.
- Introducing a deliberate error (duplicate `agent izsha` line) produces a red squiggle and a Problems-tab entry.

If any verification step fails, the LSP wire is broken — debug from `packages/vscode-extension/src/extension.ts`.

- [ ] **Step 3: Commit (if any final tweaks were needed)**

If no changes were needed, skip. Otherwise:

```bash
git -C c:/Hive/vibe add -A
git -C c:/Hive/vibe commit -m "fix(extension): re-wire after SD1 grammar growth"
```

---

## SD1 — Definition of done

All of these must hold before SD1 is complete:

- [ ] `pnpm -r build` exits 0 across both packages.
- [ ] `pnpm --filter @vibe/language test` reports 64 passing tests across 8 test files.
- [ ] All 9 examples in `c:/Hive/vibe/examples/` parse and validate with zero errors.
- [ ] The Langium-emitted TextMate grammar at `c:/Hive/vibe/packages/vscode-extension/syntaxes/vibe.tmLanguage.json` highlights all 9 primitive keywords.
- [ ] The VS Code extension still launches the LSP for `.vibe` files; opening an example shows syntax highlighting.
- [ ] Git log on `c:/Hive/vibe` shows ~20 commits added since `1117f6f`, each a small, focused, testable change.
- [ ] `c:/Hive/vibe/packages/language/README.md` documents the surface SD1 produced.

When all checks pass, push to origin and brainstorm SD2 (file-shape dispatcher + LLM resolver).

---

## Self-review checklist

**Spec coverage:** Skim spec §2 (the 9 primitives) — every primitive has a Task in this plan. ✓
**Placeholder scan:** No `TBD` / `TODO` / "implement later" anywhere. Every step has exact code or commands. ✓
**Type consistency:** AST type names (Project, Agent, Route, Fallback, Persona, Provider, Memory, Harness, Plugin, Trigger, Field, Expression, StringLiteral, NumberLiteral, BooleanLiteral, NullLiteral, Reference, ListExpression, ObjectExpression, ObjectEntry, TypeReference, QualifiedName) are used consistently across Tasks 2–17. ✓
**Cross-spec alignment:** Type annotation syntax (`key : Type = value`) added in Task 5 matches spec §9.2. Required `resolver` route added in Task 16 matches spec §2.2. Cross-reference rules in Task 17 match spec §2 reference patterns. ✓

---

*End of SD1 plan. SD2 brainstorm opens when SD1 lands.*
