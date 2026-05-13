# Vibe

> The unified vibecode language.

A hybrid specification language for vibecoded ecosystems: deterministic where the source is structured, LLM-guided where the source is prose. Designed to be the unified target for LLM-authored large-system software, provider-agnostic across Codex / Claude / Cerebras / Gemini / Grok via both API and CLI modes.

**Status:** early scaffold. Architecture spec at [`docs/superpowers/specs/2026-05-13-vibe-architecture.md`](docs/superpowers/specs/2026-05-13-vibe-architecture.md). Library survey at [`docs/superpowers/research/2026-05-13-library-survey.md`](docs/superpowers/research/2026-05-13-library-survey.md) (when landed). Phase 0 ecosystem research at [`docs/superpowers/research/2026-05-13-codex-claude-ecosystem-survey.md`](docs/superpowers/research/2026-05-13-codex-claude-ecosystem-survey.md).

## Packages

| Package | Role | Status |
| ------- | ---- | ------ |
| [`packages/language`](packages/language) | Parser, AST, evaluator, stdlib, FFI, LLM resolver, `vibe init` / `sync` / `build` | Stub |
| [`packages/vscode-extension`](packages/vscode-extension) | `vibe-vscode` — syntax highlighting, diagnostics, tree view, commands, hover resolver preview | Stub |

## Repo layout

```text
vibe/
├── docs/superpowers/{specs,research}/
├── packages/
│   ├── language/
│   └── vscode-extension/
├── package.json              # workspaces root
├── tsconfig.base.json        # shared TS config
├── .gitignore
└── README.md
```

## Quickstart (once Phase 1 lands)

Not buildable yet. Pending the Phase 1 brainstorming session and the library survey landing. See [`docs/superpowers/specs/`](docs/superpowers/specs/) for the current design.
