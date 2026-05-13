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
