# Vibe ↔ Deepagents Proof of Fit (Phase 1)

This sandbox proves the `pawfall-feedback-lanes.json` "feedback-triage" lane shape maps cleanly onto LangChain's deepagents harness, using Cerebras GLM as the model.

## What it does

- Reads `fixtures/pawfall/docs/feedback/2026-05-15.md` (copy of real Pawfall feedback)
- Reads `fixtures/pawfall/docs/GDD.md` (copy of real Pawfall GDD)
- Produces `outputs/2026-05-15-action-plan.md` (the agent's docs-only action plan)
- All other reads/writes are denied by `FilesystemPermission` rules

The agent has access to deepagents' built-in tools (`write_todos`, `ls`, `read_file`, `write_file`, `edit_file`). No custom tools yet.

## Why this is isolated

- Lives in `sandbox/` (outside the `pnpm-workspace.yaml` `packages/*` globs)
- Standalone `package.json`; install with `npm`, not `pnpm`, to avoid cross-talk with the workspace
- Fixtures are **copies** of real Pawfall files — the agent never touches `C:/GameSpree/`
- If the POC misbehaves, deleting this folder is a complete rollback

## Setup

```bash
cd sandbox/deepagents-poc
npm install
cp .env.example .env
# Edit .env: fill CEREBRAS_API_KEY, confirm CEREBRAS_MODEL is one your Cerebras tier hosts
```

## Run

```bash
npm run run
```

You'll see streamed agent events on stdout (`write_todos` calls, tool calls, the final assistant message). The action plan lands in `outputs/`.

## What this validates

If the agent produces a sensible plan that:

1. Maps every feedback bullet to a category + GDD-aligned action
2. Cites GDD section names (design pillars, core principles, mood vocabulary, etc.)
3. Stays within the permitted write scope (no Unity asset writes, no runtime writes)
4. Surfaces conflicts as open questions rather than silently making them go away

…then deepagents is a viable execution substrate for Vibe lanes, and Phase 2 (a `.vibe → createDeepAgent` translator) is justified.

If the agent fails in interesting ways — wrong permissions errors, model not found, JSON-shape mismatches — those are the integration issues to log and address before Phase 2.

## Files

```
sandbox/deepagents-poc/
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
├── fixtures/pawfall/docs/
│   ├── feedback/2026-05-15.md   (copied from C:/GameSpree)
│   └── GDD.md                    (copied from C:/GameSpree)
├── outputs/                      (agent writes here)
└── src/
    ├── cerebras-model.ts         (LangChain ChatOpenAI configured for Cerebras)
    ├── feedback-triage.ts        (createDeepAgent lane definition)
    └── run.ts                    (entry point: invoke + stream events)
```

## Troubleshooting

- **`CEREBRAS_API_KEY missing`** — copy `.env.example` to `.env` and fill in your key.
- **Model not found / 404** — Cerebras's catalog evolves; check what's available in your Cerebras console and update `CEREBRAS_MODEL` in your `.env`. The default `zai-glm-4.6` is a guess; verify before running.
- **Permission denied on a path you expected** — order of `permissions` array matters. Allow rules come first, the catch-all `**` deny is last. See `src/feedback-triage.ts`.
- **Install errors mentioning `pnpm-workspace.yaml`** — use `npm install` here, not `pnpm`. The sandbox is intentionally outside the workspace.
- **Cerebras returns malformed tool calls** — deepagents relies on the model's tool-use ability. If GLM-on-Cerebras struggles with tool calls, swap to a stronger model temporarily (e.g., Anthropic Claude) by editing `cerebras-model.ts` to return a `ChatAnthropic` instance instead, just to confirm the harness works.

## Next steps after this validates

1. **Phase 2 — Translator**: write `packages/language/src/runtime/deepagents-translator.ts` that takes a parsed `.vibe` AST and emits a `createDeepAgent` config like this one.
2. **Phase 3 — Cockpit wiring**: dashboard "Run lane" button executes via translator → deepagents; stream events render in the UI.
3. **Phase 4 — External CLI surfaces**: add `invokeCodexCli` and `invokeClaudeCli` tools so deepagents lanes can delegate to those surfaces.
