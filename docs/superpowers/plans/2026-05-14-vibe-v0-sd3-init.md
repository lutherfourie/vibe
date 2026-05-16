# Vibe v0 SD3 — `vibe init` analysis pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `vibe init <repo>` and `vibe sync <repo>` end-to-end against the GameSpree reference repo. Output is a `<repo>/.vibe/` Obsidian-compatible vault populated by the 10 numbered folders from the spec, mixing deterministic notes from git/file inspection with resolver-generated notes from SD2's LLM pipeline.

**Architecture:** Two new workspace packages — `packages/init` (the analysis pipeline as a library) and `packages/cli` (the `vibe` binary, a thin shell over the library). The pipeline decomposes into three stages: scan (RepoFacts), emit-plan (NoteSpec[]), write (vault on disk). Each generated note opens with YAML frontmatter declaring its provenance (deterministic / resolver / human); `vibe sync` honors the human contract and regenerates the rest based on per-note cache keys. SD2's resolver, dispatcher, and provider abstractions are reused unchanged — SD3 only adds the analysis layer above them.

**Tech Stack:** TypeScript 5.6+, Node.js 22+, pnpm workspaces (existing), Vitest 2.x (existing). New deps: `simple-git` 3.x (git topology + commit log), `commander` 13.x (CLI parsing), `gray-matter` 4.x (YAML frontmatter), `globby` 14.x (file pattern detection). Re-uses SD2: `@vibe/language` exports (`runPipeline`, `resolveProse`, `createCerebrasProvider`, `createMockProvider`, `createProviderRegistry`, `dispatchSource`, Zod schemas).

**Reference spec:** `docs/superpowers/specs/2026-05-14-vibe-v0-sd3-init-design.md` (commit `4dce746`). Read the full spec before starting Task 1 — every implementation decision below traces back to a numbered section.

**Reference plan:** `docs/superpowers/plans/2026-05-14-vibe-v0-sd2-resolver.md` is the structural template. SD3 follows the same TDD bite-size shape, the same singleton-services pattern in tests, the same "stage but don't commit (parent context handles commits)" subagent protocol, and the same provenance-based worktree handling.

**Pre-conditions verified before SD3 starts:**

- `pnpm --filter @vibe/language test` reports 228/228 on `main`
- `pnpm --filter @vibe/language build` exits 0
- `git log --oneline -1` is `c887bd0 fix(dispatcher): sliceConversation tolerates CRLF line endings` (SD2 merged + CRLF fix) or later
- The SD3 design spec exists at the path above

**Definition of done (full checklist in §Definition of done at the bottom):**

- 310-330 tests passing across the workspace
- `pnpm -r build` exits 0 across `@vibe/language`, `@vibe/init`, `@vibe/cli`, `vibe-vscode`
- `node packages/language/scripts/lsp-smoke.mjs` still prints 17 LSP capabilities (SD2 invariant preserved)
- `vibe init c:/GameSpree` with `--no-llm` succeeds end-to-end and emits all 10 vault folders
- `vibe init c:/GameSpree` with real Cerebras credentials succeeds end-to-end (manual smoke; not in CI)
- `vibe sync c:/GameSpree` re-runs cleanly and preserves human-tagged notes

---

## File Structure

### New files (created by SD3)

```text
packages/
├── init/                                       NEW workspace package
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── README.md
│   └── src/
│       ├── index.ts                            # public API barrel: runInit, runSync
│       ├── types.ts                            # RepoFacts, NoteSpec, NoteFrontmatter, etc.
│       ├── scan/
│       │   ├── index.ts                        # scanRepo(repoRoot, opts): Promise<RepoFacts>
│       │   ├── git.ts                          # simple-git wrapper helpers
│       │   ├── topology.ts                     # current branch, ahead/behind, dirty files
│       │   ├── commit-log.ts                   # capped commit log + author/date parsing
│       │   ├── file-inventory.ts               # globby walk + stat
│       │   ├── manifests.ts                    # detect package.json / Cargo.toml / etc.
│       │   ├── plan-files.ts                   # detect plan files (heuristic globs)
│       │   ├── research-files.ts               # detect research files
│       │   ├── conversation-files.ts           # detect .vibe files in conversation shape
│       │   ├── agent-branches.ts               # group commits by claude/* / codex/* prefix
│       │   ├── weekly-buckets.ts               # per-week commit/contributor counts
│       │   └── cache.ts                        # HEAD-SHA keyed RepoFacts cache
│       ├── emit/
│       │   ├── index.ts                        # emitPlan(facts, vault, opts): NoteSpec[]
│       │   ├── prompts.ts                      # shared resolver prompt templates
│       │   ├── schemas.ts                      # Zod schemas for resolver outputs
│       │   ├── vault-scan.ts                   # read existing vault frontmatter
│       │   ├── wikilinks.ts                    # cross-link renderers
│       │   └── folders/
│       │       ├── state.ts                    # 00-state (deterministic)
│       │       ├── projects.ts                 # 10-projects (deterministic)
│       │       ├── agents.ts                   # 20-agents (hybrid)
│       │       ├── decisions.ts                # 30-decisions (resolver)
│       │       ├── plans.ts                    # 40-plans (deterministic)
│       │       ├── timeline.ts                 # 50-timeline (hybrid)
│       │       ├── hotspots.ts                 # 60-hotspots (deterministic)
│       │       ├── glossary.ts                 # 70-glossary (resolver)
│       │       ├── conversations.ts            # 80-conversations (hybrid)
│       │       └── research.ts                 # 90-research (deterministic)
│       ├── write/
│       │   ├── index.ts                        # writeNotes(specs, vaultRoot, opts)
│       │   ├── frontmatter.ts                  # gray-matter wrapper + Zod validation
│       │   ├── refresh-rules.ts                # human / deterministic / resolver decision
│       │   ├── render-note.ts                  # compose frontmatter + body + wikilinks footer
│       │   ├── diff.ts                         # bytes-changed check; preserve mtimes
│       │   └── stale.ts                        # mark stale, don't delete
│       ├── obsidian/
│       │   └── workspace-skeleton.ts           # emit minimal .obsidian/ config on first init
│       ├── report.ts                           # last-run.json shape + writer
│       └── pipeline.ts                         # runInit / runSync orchestrators
└── cli/                                        NEW workspace package
    ├── package.json
    ├── tsconfig.json
    ├── vitest.config.ts
    ├── README.md
    └── src/
        ├── cli.ts                              # commander entry point; dispatches subcommands
        ├── env.ts                              # CEREBRAS_API_KEY discovery + validation
        └── commands/
            ├── init.ts
            ├── sync.ts
            └── build.ts                        # stub
```

### Test files

```text
packages/init/test/
├── fixtures/
│   ├── repos/
│   │   ├── tiny.git.tar.gz                     # 3 commits, single branch
│   │   ├── agents.git.tar.gz                   # 20 commits across main + claude/* + codex/*
│   │   └── revert-chain.git.tar.gz             # 8 commits including 2 explicit reverts
│   ├── recordings/
│   │   ├── decisions-revert-chain.json
│   │   ├── glossary-agents.json
│   │   ├── agent-identity-codex.json
│   │   ├── weekly-summary-agents.json
│   │   └── conversation-summary.json
│   └── gamespree-snapshot.sha                  # pinned commit for the integration test
├── helpers/
│   ├── fixture-repo.ts                         # extract tar.gz to tmp dir, return path
│   ├── in-memory-vault.ts                      # Map<path, content> abstraction for write tests
│   └── mock-provider.ts                        # thin wrapper around SD2's createMockProvider
├── scan/
│   ├── topology.test.ts
│   ├── commit-log.test.ts
│   ├── file-inventory.test.ts
│   ├── manifests.test.ts
│   ├── plan-files.test.ts
│   ├── research-files.test.ts
│   ├── conversation-files.test.ts
│   ├── agent-branches.test.ts
│   ├── weekly-buckets.test.ts
│   ├── cache.test.ts
│   └── scan.test.ts                            # orchestrator smoke
├── emit/
│   ├── folders/
│   │   ├── state.test.ts
│   │   ├── projects.test.ts
│   │   ├── agents.test.ts
│   │   ├── decisions.test.ts
│   │   ├── plans.test.ts
│   │   ├── timeline.test.ts
│   │   ├── hotspots.test.ts
│   │   ├── glossary.test.ts
│   │   ├── conversations.test.ts
│   │   └── research.test.ts
│   ├── wikilinks.test.ts
│   └── vault-scan.test.ts
├── write/
│   ├── frontmatter.test.ts
│   ├── refresh-rules.test.ts
│   ├── render-note.test.ts
│   ├── diff.test.ts
│   └── stale.test.ts
├── pipeline.test.ts                            # init + sync round-trip
└── integration/
    └── gamespree.test.ts                       # snapshot test against c:/GameSpree

packages/cli/test/
├── commands/
│   ├── init.test.ts
│   ├── sync.test.ts
│   └── build.test.ts
└── env.test.ts
```

### Modified files

- `pnpm-workspace.yaml` — already includes `packages/*`; verify it picks up `init` and `cli` automatically (it should)
- Root `tsconfig.base.json` (if present) — add path mappings only if necessary
- `packages/language/scripts/lsp-smoke.mjs` — no change; re-verified at the end of SD3

---

## Branch Strategy

Create a worktree at `c:/Hive/vibe-sd3` mirroring the SD1/SD2 pattern:

```bash
cd c:/Hive/vibe
git checkout main
git pull --ff-only origin main
git worktree add c:/Hive/vibe-sd3 -b feat/sd3-init
cd c:/Hive/vibe-sd3
pnpm install
pnpm --filter @vibe/language build      # generates Langium AST + TextMate grammar
pnpm --filter @vibe/language test       # confirm 228/228 baseline
```

All work happens on `feat/sd3-init` in the worktree. Pushes are user-authorized.

---

## Subagent-Driven-Development Protocol

For each task the orchestrator should:

1. Dispatch an implementer subagent with the task brief and a hard "STOP and report" rule if the spec cannot be met.
2. Tell implementer: stage files but do NOT commit. The parent context performs every commit because the auto-mode classifier intermittently blocks the `Co-Authored-By: Claude Opus 4.7 (1M context)` footer at the subagent layer (this happened mid-SD2 starting at Task 11). Subagents stage; parent commits.
3. After implementer reports done, parent runs `git status --short` to confirm staged set matches the plan, then commits with the conventional message + co-author footer via heredoc.
4. For tasks that introduce significant grammar/architecture changes, dispatch a code-reviewer subagent before moving to the next task.
5. Mark the task done in the orchestrator's todo list. Move to next task.

---

## Phase A — Scaffolding (Tasks 1-3)

Two new workspace packages plus the three git fixture tarballs. No real logic yet.

### Task 1: `packages/init` workspace scaffold

**Files:**

- Create: `packages/init/package.json`
- Create: `packages/init/tsconfig.json`
- Create: `packages/init/vitest.config.ts`
- Create: `packages/init/src/index.ts`
- Create: `packages/init/test/smoke.test.ts`

- [ ] **Step 1: Write the failing smoke test**

`packages/init/test/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { VIBE_INIT_VERSION } from "../src/index.js";

describe("@vibe/init smoke", () => {
  it("exports a version string", () => {
    expect(typeof VIBE_INIT_VERSION).toBe("string");
    expect(VIBE_INIT_VERSION).toMatch(/^0\./);
  });
});
```

- [ ] **Step 2: Create package files**

`packages/init/package.json`:

```json
{
  "name": "@vibe/init",
  "version": "0.0.0",
  "private": true,
  "description": "Vibe init / sync analysis pipeline: scan repo, emit vault notes.",
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
  "files": ["dist", "src", "README.md"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "rimraf dist"
  },
  "dependencies": {
    "@vibe/language": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.10.1",
    "@vitest/coverage-v8": "^2.1.9",
    "rimraf": "^6.0.1",
    "typescript": "^5.6.3",
    "vitest": "^2.1.9"
  },
  "engines": {
    "node": ">=22"
  }
}
```

`packages/init/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "test", "**/*.test.ts"]
}
```

`packages/init/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 15_000,
  },
});
```

`packages/init/src/index.ts`:

```ts
export const VIBE_INIT_VERSION = "0.0.0";
```

- [ ] **Step 3: Install workspace + verify**

```bash
cd c:/Hive/vibe-sd3
pnpm install
pnpm --filter @vibe/init test
pnpm --filter @vibe/init build
```

Expected: 1 test passing, build exits 0.

- [ ] **Step 4: Stage**

```bash
cd c:/Hive/vibe-sd3
git add packages/init/ pnpm-lock.yaml
git status --short
```

Expected: 5 new files staged plus a pnpm-lock.yaml diff.

- [ ] **Step 5: Parent commits**

Parent runs:

```bash
cd c:/Hive/vibe-sd3
git commit -m "$(cat <<'EOF'
chore(init): scaffold @vibe/init workspace package

New workspace at packages/init for the SD3 analysis pipeline.
Mirrors the @vibe/language package shape: TypeScript ESM, vitest,
strict tsconfig with noUncheckedIndexedAccess + exactOptionalPropertyTypes.

Smoke test exports a VIBE_INIT_VERSION string so vitest can verify
the test runner + tsconfig wiring before any real code lands.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2: `packages/cli` workspace scaffold

**Files:**

- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/vitest.config.ts`
- Create: `packages/cli/src/cli.ts`
- Create: `packages/cli/test/smoke.test.ts`

- [ ] **Step 1: Write the failing smoke test**

`packages/cli/test/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { VIBE_CLI_VERSION } from "../src/cli.js";

describe("@vibe/cli smoke", () => {
  it("exports a version string", () => {
    expect(typeof VIBE_CLI_VERSION).toBe("string");
    expect(VIBE_CLI_VERSION).toMatch(/^0\./);
  });
});
```

- [ ] **Step 2: Create package files**

`packages/cli/package.json`:

```json
{
  "name": "@vibe/cli",
  "version": "0.0.0",
  "private": true,
  "description": "Vibe CLI: vibe init / vibe sync / vibe build.",
  "license": "MIT",
  "type": "module",
  "main": "./dist/cli.js",
  "types": "./dist/cli.d.ts",
  "bin": {
    "vibe": "./dist/cli.js"
  },
  "files": ["dist", "src", "README.md"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "rimraf dist"
  },
  "dependencies": {
    "@vibe/init": "workspace:*",
    "@vibe/language": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.10.1",
    "rimraf": "^6.0.1",
    "typescript": "^5.6.3",
    "vitest": "^2.1.9"
  },
  "engines": {
    "node": ">=22"
  }
}
```

`packages/cli/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "test", "**/*.test.ts"]
}
```

`packages/cli/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 15_000,
  },
});
```

`packages/cli/src/cli.ts`:

```ts
#!/usr/bin/env node
export const VIBE_CLI_VERSION = "0.0.0";

// Real subcommand wiring lands in Task 28+.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`vibe ${VIBE_CLI_VERSION}\n`);
}
```

- [ ] **Step 3: Install + verify**

```bash
cd c:/Hive/vibe-sd3
pnpm install
pnpm --filter @vibe/cli test
pnpm --filter @vibe/cli build
```

Expected: 1 test passing, build exits 0.

- [ ] **Step 4: Stage + parent commits**

```bash
cd c:/Hive/vibe-sd3
git add packages/cli/ pnpm-lock.yaml
```

Parent commit:

```bash
git commit -m "$(cat <<'EOF'
chore(cli): scaffold @vibe/cli workspace package

New workspace at packages/cli with bin field exposing `vibe`. Will
host the commander-driven init / sync / build subcommands in Phase H.
Depends on @vibe/init (Task 1) and @vibe/language (SD1+SD2).

Smoke test verifies the build target produces a callable module.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 3: Build git fixture tarballs

**Files:**

- Create: `packages/init/test/fixtures/repos/tiny.git.tar.gz`
- Create: `packages/init/test/fixtures/repos/agents.git.tar.gz`
- Create: `packages/init/test/fixtures/repos/revert-chain.git.tar.gz`
- Create: `packages/init/test/fixtures/repos/README.md`
- Create: `packages/init/test/helpers/fixture-repo.ts`
- Create: `packages/init/test/fixtures/repos/build.mjs`

**Why tarballs:** Nested git repos break the parent repo's git state. Storing the fixtures as tarballs (which git treats as opaque binary blobs) keeps the parent repo clean. The `build.mjs` script regenerates them deterministically — anyone can rerun it.

- [ ] **Step 1: Write the fixture-repo helper**

`packages/init/test/helpers/fixture-repo.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);
const FIXTURE_DIR = fileURLToPath(new URL("../fixtures/repos/", import.meta.url));

export async function extractFixtureRepo(name: "tiny" | "agents" | "revert-chain"): Promise<{
  path: string;
  cleanup: () => Promise<void>;
}> {
  const tmp = await mkdtemp(join(tmpdir(), `vibe-init-fixture-${name}-`));
  const tarball = join(FIXTURE_DIR, `${name}.git.tar.gz`);
  await execFile("tar", ["-xzf", tarball, "-C", tmp]);
  return {
    path: join(tmp, name),
    cleanup: () => rm(tmp, { recursive: true, force: true }),
  };
}
```

- [ ] **Step 2: Write the `build.mjs` script**

`packages/init/test/fixtures/repos/build.mjs`:

```js
#!/usr/bin/env node
// Regenerates the three git fixture tarballs deterministically.
// Run from `packages/init/`:
//     node test/fixtures/repos/build.mjs
//
// Sets GIT_AUTHOR_DATE / GIT_COMMITTER_DATE on every commit so the tarballs
// are byte-identical across runs. Fresh tarballs replace the existing ones.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);
const HERE = dirname(fileURLToPath(import.meta.url));

async function git(cwd, ...args) {
  await execFile("git", args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Fixture Author",
      GIT_AUTHOR_EMAIL: "fixture@vibe.test",
      GIT_COMMITTER_NAME: "Fixture Author",
      GIT_COMMITTER_EMAIL: "fixture@vibe.test",
    },
  });
}

async function commit(cwd, message, date, env = {}) {
  await execFile("git", ["commit", "-m", message, "--allow-empty"], {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: env.author ?? "Fixture Author",
      GIT_AUTHOR_EMAIL: env.email ?? "fixture@vibe.test",
      GIT_COMMITTER_NAME: env.author ?? "Fixture Author",
      GIT_COMMITTER_EMAIL: env.email ?? "fixture@vibe.test",
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    },
  });
}

async function buildTiny(workdir) {
  const repo = join(workdir, "tiny");
  await execFile("mkdir", [repo]);
  await git(repo, "init", "--initial-branch=main");
  await writeFile(join(repo, "README.md"), "# Tiny\n");
  await git(repo, "add", "README.md");
  await commit(repo, "chore: initial commit", "2026-01-01T10:00:00Z");
  await writeFile(join(repo, "README.md"), "# Tiny\n\nA tiny test repo.\n");
  await git(repo, "add", "README.md");
  await commit(repo, "docs: expand readme", "2026-01-02T10:00:00Z");
  await writeFile(join(repo, "main.ts"), "console.log('hi');\n");
  await git(repo, "add", "main.ts");
  await commit(repo, "feat: add main.ts", "2026-01-03T10:00:00Z");
  return repo;
}

async function buildAgents(workdir) {
  const repo = join(workdir, "agents");
  await execFile("mkdir", [repo]);
  await git(repo, "init", "--initial-branch=main");
  await writeFile(join(repo, "README.md"), "# Agents\n");
  await git(repo, "add", "README.md");
  await commit(repo, "chore: initial", "2026-01-01T10:00:00Z");

  // 10 commits on main by a human author
  for (let i = 1; i <= 10; i++) {
    await writeFile(join(repo, `main-${i}.txt`), `${i}\n`);
    await git(repo, "add", ".");
    await commit(repo, `feat: main work ${i}`, `2026-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`, {
      author: "Human Author",
      email: "human@vibe.test",
    });
  }

  // 5 commits on claude/feature-1
  await git(repo, "checkout", "-b", "claude/feature-1");
  for (let i = 1; i <= 5; i++) {
    await writeFile(join(repo, `claude-${i}.txt`), `${i}\n`);
    await git(repo, "add", ".");
    await commit(repo, `feat(claude): work ${i}`, `2026-02-${String(i).padStart(2, "0")}T10:00:00Z`, {
      author: "Claude",
      email: "claude@vibe.test",
    });
  }

  // 4 commits on codex/feature-2
  await git(repo, "checkout", "main");
  await git(repo, "checkout", "-b", "codex/feature-2");
  for (let i = 1; i <= 4; i++) {
    await writeFile(join(repo, `codex-${i}.txt`), `${i}\n`);
    await git(repo, "add", ".");
    await commit(repo, `feat(codex): work ${i}`, `2026-03-${String(i).padStart(2, "0")}T10:00:00Z`, {
      author: "Codex",
      email: "codex@vibe.test",
    });
  }

  await git(repo, "checkout", "main");
  return repo;
}

async function buildRevertChain(workdir) {
  const repo = join(workdir, "revert-chain");
  await execFile("mkdir", [repo]);
  await git(repo, "init", "--initial-branch=main");
  await writeFile(join(repo, "README.md"), "# Revert\n");
  await git(repo, "add", "README.md");
  await commit(repo, "chore: initial", "2026-01-01T10:00:00Z");

  await writeFile(join(repo, "feature.ts"), "export const x = 1;\n");
  await git(repo, "add", "feature.ts");
  await commit(repo, "feat: introduce feature", "2026-01-02T10:00:00Z");

  const introSha = (await execFile("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim();

  await writeFile(join(repo, "feature.ts"), "export const x = 2;\n");
  await git(repo, "add", "feature.ts");
  await commit(repo, "feat: tune feature", "2026-01-03T10:00:00Z");

  await git(repo, "revert", "--no-edit", introSha);

  await writeFile(join(repo, "feature-v2.ts"), "export const y = 1;\n");
  await git(repo, "add", "feature-v2.ts");
  await commit(repo, "feat: introduce feature v2", "2026-01-04T10:00:00Z");
  const v2Sha = (await execFile("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim();

  await writeFile(join(repo, "feature-v2.ts"), "export const y = 2;\n");
  await git(repo, "add", "feature-v2.ts");
  await commit(repo, "feat: tune feature v2", "2026-01-05T10:00:00Z");

  await git(repo, "revert", "--no-edit", v2Sha);

  return repo;
}

async function tarball(repoPath, outPath) {
  const parent = dirname(repoPath);
  const base = repoPath.slice(parent.length + 1);
  await execFile("tar", ["-czf", outPath, "-C", parent, base]);
}

async function main() {
  const workdir = await mkdtemp(join(tmpdir(), "vibe-fixture-build-"));
  try {
    for (const [name, builder] of [
      ["tiny", buildTiny],
      ["agents", buildAgents],
      ["revert-chain", buildRevertChain],
    ]) {
      const repo = await builder(workdir);
      await tarball(repo, join(HERE, `${name}.git.tar.gz`));
      process.stdout.write(`wrote ${name}.git.tar.gz\n`);
    }
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  process.stderr.write(`build failed: ${e?.message ?? e}\n`);
  process.exit(1);
});
```

- [ ] **Step 3: Document why these exist**

`packages/init/test/fixtures/repos/README.md`:

```markdown
# Git fixture repos

Three git repos pre-built as tarballs for the SD3 scan tests:

- `tiny.git.tar.gz` — 3 commits, single branch, single file. Smoke test.
- `agents.git.tar.gz` — 20 commits across `main`, `claude/feature-1`,
  `codex/feature-2`. Smoke test for agent-branch detection + weekly buckets.
- `revert-chain.git.tar.gz` — 5 commits including 2 explicit reverts.
  Smoke test for decision-cluster detection.

Tarballs are byte-deterministic: `build.mjs` pins `GIT_AUTHOR_DATE` /
`GIT_COMMITTER_DATE` on every commit. Regenerate with:

```bash
cd packages/init
node test/fixtures/repos/build.mjs
```

Tests extract the tarballs to `os.tmpdir()` via `extractFixtureRepo()`
from `test/helpers/fixture-repo.ts`.
```

- [ ] **Step 4: Run the build script + stage**

```bash
cd c:/Hive/vibe-sd3/packages/init
node test/fixtures/repos/build.mjs
```

Expected output: three "wrote X.git.tar.gz" lines.

```bash
cd c:/Hive/vibe-sd3
git add packages/init/test/
```

- [ ] **Step 5: Parent commits**

```bash
git commit -m "$(cat <<'EOF'
test(init): three deterministic git fixture repos as tarballs

Storing nested git repos breaks the parent repo's git state, so the
three SD3 scan fixtures live as .tar.gz blobs. build.mjs regenerates
them byte-identically (pinned author + committer dates).

- tiny: 3 commits / 1 branch / 1 file
- agents: 20 commits across main + claude/* + codex/*
- revert-chain: 5 commits including 2 reverts

Tests use extractFixtureRepo() from test/helpers/fixture-repo.ts to
unpack into os.tmpdir() per test.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase B — Stage 1 scan (Tasks 4-10)

Build the `RepoFacts` producer. Each task gets one slice of the scanner with a focused test against one of the three fixture repos.

### Task 4: RepoFacts types + `git` wrapper

**Files:**

- Create: `packages/init/src/types.ts`
- Create: `packages/init/src/scan/git.ts`
- Create: `packages/init/test/scan/git.test.ts`
- Modify: `packages/init/package.json` (add `simple-git@^3`)

- [ ] **Step 1: Add dependency**

```bash
cd c:/Hive/vibe-sd3
pnpm --filter @vibe/init add simple-git@^3
```

- [ ] **Step 2: Write the failing test**

`packages/init/test/scan/git.test.ts`:

```ts
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { extractFixtureRepo } from "../helpers/fixture-repo.js";
import { openRepo } from "../../src/scan/git.js";

let repoPath: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const fx = await extractFixtureRepo("tiny");
  repoPath = fx.path;
  cleanup = fx.cleanup;
});

afterEach(() => {});

describe("openRepo", () => {
  it("returns a SimpleGit instance bound to the repo root", async () => {
    const repo = openRepo(repoPath);
    const log = await repo.log({ maxCount: 1 });
    expect(log.total).toBe(1);
    expect(log.latest?.message).toMatch(/feat: add main\.ts/);
  });

  it("rejects when the path is not a git repo", async () => {
    const repo = openRepo("/nonexistent/path");
    await expect(repo.log()).rejects.toThrow();
  });
});

// Cleanup after the whole file so other tests in this file can share the fixture.
import { afterAll } from "vitest";
afterAll(async () => {
  if (cleanup) await cleanup();
});
```

- [ ] **Step 3: Run test — expect failure**

```bash
pnpm --filter @vibe/init test test/scan/git.test.ts
```

Expected: `Failed to load url ../../src/scan/git.js`.

- [ ] **Step 4: Write types + git wrapper**

`packages/init/src/types.ts`:

```ts
export interface CommitInfo {
  sha: string;
  author: string;
  authorEmail: string;
  date: string;       // ISO 8601
  subject: string;    // first line of the message
  body: string;       // everything after the subject; empty string if none
  parents: string[];
  refs: string[];     // local + remote refs pointing at this commit
}

export interface FileInfo {
  path: string;       // forward-slash, relative to repoRoot
  size: number;
  mtime: string;      // ISO 8601
}

export interface ManifestInfo {
  path: string;       // relative
  kind: "package.json" | "Cargo.toml" | "pyproject.toml" | "go.mod" | "pom.xml" | "readme";
  name: string;       // best-effort: package name, crate name, etc.
}

export interface PlanFileInfo {
  path: string;
  firstLine: string;          // for the wikilink title
  excerpt: string;            // first 200 chars of body
}

export interface ResearchFileInfo {
  path: string;
  firstLine: string;
  excerpt: string;
}

export interface ConversationFileInfo {
  path: string;
  turnCount: number;
  firstUserPrompt: string;    // first 200 chars
}

export interface AgentInfo {
  id: string;                 // e.g. "claude" extracted from claude/* branches
  branches: string[];
  commits: number;
  firstSeen: string;          // ISO 8601
  lastSeen: string;
}

export interface WeeklyBucket {
  isoWeek: string;            // e.g. "2026-W19"
  startDate: string;          // ISO date of Monday
  commitCount: number;
  contributors: string[];
  filesChanged: number;
  subjects: string[];         // first 20 commit subjects for the resolver
}

export interface RepoTopology {
  currentBranch: string;
  ahead: number;
  behind: number;
  dirtyFiles: string[];
  upstream: string | null;
}

export interface RepoIdentity {
  name: string;
  primaryLanguage: string;
  defaultBranch: string;
}

export interface RepoFacts {
  repoRoot: string;
  identity: RepoIdentity;
  topology: RepoTopology;
  commits: CommitInfo[];
  files: FileInfo[];
  manifests: ManifestInfo[];
  planFiles: PlanFileInfo[];
  researchFiles: ResearchFileInfo[];
  conversationFiles: ConversationFileInfo[];
  agents: AgentInfo[];
  weeklyBuckets: WeeklyBucket[];
  scannedAt: string;          // ISO 8601
  headSha: string;
}
```

`packages/init/src/scan/git.ts`:

```ts
import { simpleGit, type SimpleGit } from "simple-git";

/**
 * Bind a SimpleGit instance to a repo root. Defers actual I/O to the first
 * call against the returned client - so unit tests that never touch the
 * filesystem do not need a real git directory.
 */
export function openRepo(repoRoot: string): SimpleGit {
  return simpleGit({ baseDir: repoRoot, maxConcurrentProcesses: 4 });
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
pnpm --filter @vibe/init test test/scan/git.test.ts
```

Expected: `2 passed`.

- [ ] **Step 6: Stage + parent commits**

```bash
cd c:/Hive/vibe-sd3
git add packages/init/src/ packages/init/test/scan/git.test.ts \
        packages/init/package.json pnpm-lock.yaml
```

Parent commit:

```bash
git commit -m "$(cat <<'EOF'
feat(init): RepoFacts types + simple-git wrapper

types.ts declares the full RepoFacts shape SD3 builds against:
CommitInfo, FileInfo, ManifestInfo, PlanFileInfo, ResearchFileInfo,
ConversationFileInfo, AgentInfo, WeeklyBucket, RepoTopology,
RepoIdentity, RepoFacts.

scan/git.ts is a one-line openRepo helper that returns a SimpleGit
instance bound to the repo root. Encapsulation point so future
swap-outs (e.g. nodegit) only touch this file.

Adds simple-git@3 to deps.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 5: Topology scanner

**Files:**

- Create: `packages/init/src/scan/topology.ts`
- Create: `packages/init/test/scan/topology.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/init/test/scan/topology.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractFixtureRepo } from "../helpers/fixture-repo.js";
import { openRepo } from "../../src/scan/git.js";
import { scanTopology } from "../../src/scan/topology.js";

let repoPath: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const fx = await extractFixtureRepo("tiny");
  repoPath = fx.path;
  cleanup = fx.cleanup;
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

describe("scanTopology", () => {
  it("reports the current branch", async () => {
    const t = await scanTopology(openRepo(repoPath), repoPath);
    expect(t.currentBranch).toBe("main");
  });

  it("reports no dirty files for a clean checkout", async () => {
    const t = await scanTopology(openRepo(repoPath), repoPath);
    expect(t.dirtyFiles).toEqual([]);
  });

  it("flags an unstaged edit as dirty", async () => {
    await writeFile(join(repoPath, "main.ts"), "console.log('changed');\n");
    const t = await scanTopology(openRepo(repoPath), repoPath);
    expect(t.dirtyFiles).toContain("main.ts");
  });

  it("reports null upstream for a repo with no remote", async () => {
    const t = await scanTopology(openRepo(repoPath), repoPath);
    expect(t.upstream).toBeNull();
    expect(t.ahead).toBe(0);
    expect(t.behind).toBe(0);
  });
});
```

- [ ] **Step 2: Run test — expect failure (module-not-found)**

- [ ] **Step 3: Implementation**

`packages/init/src/scan/topology.ts`:

```ts
import type { SimpleGit } from "simple-git";
import type { RepoTopology } from "../types.js";

export async function scanTopology(repo: SimpleGit, _repoRoot: string): Promise<RepoTopology> {
  const status = await repo.status();
  const currentBranch = status.current ?? "(detached)";
  const upstream = status.tracking ?? null;

  const dirtyFiles = [
    ...status.modified,
    ...status.created,
    ...status.deleted,
    ...status.not_added,
    ...status.renamed.map((r) => r.to),
  ].sort();

  return {
    currentBranch,
    ahead: status.ahead,
    behind: status.behind,
    dirtyFiles,
    upstream,
  };
}
```

- [ ] **Step 4: Run tests — expect 4 passed**

- [ ] **Step 5: Stage + parent commits**

```bash
git add packages/init/src/scan/topology.ts packages/init/test/scan/topology.test.ts
```

Parent commit message:

```text
feat(init): scanTopology reports branch / ahead / behind / dirty

Wraps simple-git's status() into the RepoTopology shape. Dirty list
unions modified + created + deleted + untracked + renamed-to so the
00-state note shows everything the user can see in `git status`.
Upstream is null when no remote is configured (fixture case).
```

### Task 6: Commit log scanner

**Files:**

- Create: `packages/init/src/scan/commit-log.ts`
- Create: `packages/init/test/scan/commit-log.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/init/test/scan/commit-log.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractFixtureRepo } from "../helpers/fixture-repo.js";
import { openRepo } from "../../src/scan/git.js";
import { scanCommitLog } from "../../src/scan/commit-log.js";

let repoPath: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const fx = await extractFixtureRepo("agents");
  repoPath = fx.path;
  cleanup = fx.cleanup;
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

describe("scanCommitLog", () => {
  it("returns commits in descending date order capped at maxCount", async () => {
    const log = await scanCommitLog(openRepo(repoPath), { maxCount: 1000, allBranches: true });
    expect(log.length).toBeGreaterThanOrEqual(20);
    for (let i = 1; i < log.length; i++) {
      expect(Date.parse(log[i - 1]!.date)).toBeGreaterThanOrEqual(Date.parse(log[i]!.date));
    }
  });

  it("includes commits from claude/* and codex/* branches when allBranches=true", async () => {
    const log = await scanCommitLog(openRepo(repoPath), { maxCount: 1000, allBranches: true });
    const authors = new Set(log.map((c) => c.author));
    expect(authors.has("Claude")).toBe(true);
    expect(authors.has("Codex")).toBe(true);
  });

  it("excludes feature-branch commits when allBranches=false", async () => {
    const log = await scanCommitLog(openRepo(repoPath), { maxCount: 1000, allBranches: false });
    const authors = new Set(log.map((c) => c.author));
    expect(authors.has("Claude")).toBe(false);
    expect(authors.has("Codex")).toBe(false);
  });

  it("respects maxCount", async () => {
    const log = await scanCommitLog(openRepo(repoPath), { maxCount: 3, allBranches: true });
    expect(log).toHaveLength(3);
  });

  it("parses subject + body and the parents array", async () => {
    const log = await scanCommitLog(openRepo(repoPath), { maxCount: 1, allBranches: true });
    const c = log[0]!;
    expect(c.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(c.subject.length).toBeGreaterThan(0);
    expect(typeof c.body).toBe("string");
    expect(Array.isArray(c.parents)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect module-not-found failure**

- [ ] **Step 3: Implementation**

`packages/init/src/scan/commit-log.ts`:

```ts
import type { SimpleGit } from "simple-git";
import type { CommitInfo } from "../types.js";

export interface CommitLogOptions {
  maxCount: number;
  allBranches: boolean;
}

export async function scanCommitLog(repo: SimpleGit, opts: CommitLogOptions): Promise<CommitInfo[]> {
  const args = ["log", `--max-count=${opts.maxCount}`, "--date=iso-strict"];
  if (opts.allBranches) args.push("--all");
  // %H %an %ae %aI %P || %s\n%b    (custom format with NUL terminator)
  args.push("--pretty=format:%H%x09%an%x09%ae%x09%aI%x09%P%x09%s%x09%b%x00");
  const raw = await repo.raw(args);

  const commits: CommitInfo[] = [];
  for (const block of raw.split(" ")) {
    if (!block.trim()) continue;
    const parts = block.split("\t");
    if (parts.length < 7) continue;
    const [sha, author, authorEmail, date, parentsRaw, subject, ...bodyParts] = parts as [
      string, string, string, string, string, string, ...string[]
    ];
    commits.push({
      sha,
      author,
      authorEmail,
      date,
      subject,
      body: bodyParts.join("\t").replace(/^\n/, "").trimEnd(),
      parents: parentsRaw ? parentsRaw.split(" ").filter(Boolean) : [],
      refs: [],
    });
  }
  return commits;
}
```

- [ ] **Step 4: Run tests — expect 5 passed**

- [ ] **Step 5: Stage + parent commits**

```bash
git add packages/init/src/scan/commit-log.ts packages/init/test/scan/commit-log.test.ts
```

Parent commit message:

```text
feat(init): scanCommitLog returns capped + parsed CommitInfo[]

Uses git log with a custom \x00-terminated, \t-separated format
so we get the parents array + author + body without regex hacks.
allBranches=true is the default for `vibe init` (otherwise we miss
feature-branch decisions); single-branch mode is reserved for
tests where we want to control scope.
```

### Task 7: File inventory

**Files:**

- Create: `packages/init/src/scan/file-inventory.ts`
- Create: `packages/init/test/scan/file-inventory.test.ts`
- Modify: `packages/init/package.json` (add `globby@^14`)

- [ ] **Step 1: Add dependency**

```bash
pnpm --filter @vibe/init add globby@^14
```

- [ ] **Step 2: Write the failing test**

`packages/init/test/scan/file-inventory.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractFixtureRepo } from "../helpers/fixture-repo.js";
import { scanFileInventory } from "../../src/scan/file-inventory.js";

let repoPath: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const fx = await extractFixtureRepo("tiny");
  repoPath = fx.path;
  cleanup = fx.cleanup;
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

describe("scanFileInventory", () => {
  it("returns one entry per tracked file", async () => {
    const files = await scanFileInventory(repoPath);
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual(["README.md", "main.ts"]);
  });

  it("populates size + mtime for each entry", async () => {
    const files = await scanFileInventory(repoPath);
    for (const f of files) {
      expect(f.size).toBeGreaterThan(0);
      expect(Date.parse(f.mtime)).toBeGreaterThan(0);
    }
  });

  it("ignores .git/ contents", async () => {
    const files = await scanFileInventory(repoPath);
    expect(files.every((f) => !f.path.startsWith(".git/"))).toBe(true);
  });

  it("uses forward-slash paths regardless of platform", async () => {
    const files = await scanFileInventory(repoPath);
    expect(files.every((f) => !f.path.includes("\\"))).toBe(true);
  });
});
```

- [ ] **Step 3: Run test — expect module-not-found failure**

- [ ] **Step 4: Implementation**

`packages/init/src/scan/file-inventory.ts`:

```ts
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { globby } from "globby";
import type { FileInfo } from "../types.js";

export async function scanFileInventory(repoRoot: string): Promise<FileInfo[]> {
  const paths = await globby(["**/*"], {
    cwd: repoRoot,
    dot: true,
    onlyFiles: true,
    gitignore: true,
    ignore: [".git/**"],
  });

  const out: FileInfo[] = [];
  for (const rel of paths) {
    const abs = join(repoRoot, rel);
    const s = await stat(abs);
    out.push({
      path: rel.replace(/\\/g, "/"),
      size: s.size,
      mtime: s.mtime.toISOString(),
    });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}
```

- [ ] **Step 5: Run tests — expect 4 passed**

- [ ] **Step 6: Stage + parent commits**

```bash
git add packages/init/src/scan/file-inventory.ts \
        packages/init/test/scan/file-inventory.test.ts \
        packages/init/package.json pnpm-lock.yaml
```

Parent commit message:

```text
feat(init): scanFileInventory walks the repo via globby

Honors .gitignore, skips .git/. Normalizes paths to forward slash
so downstream renderers do not have to branch on platform. size +
mtime are pulled from Node's fs.stat (ISO timestamp for sortability).

Adds globby@14 to deps.
```

### Task 8: Manifest + plan + research detection

**Files:**

- Create: `packages/init/src/scan/manifests.ts`
- Create: `packages/init/src/scan/plan-files.ts`
- Create: `packages/init/src/scan/research-files.ts`
- Create: `packages/init/test/scan/manifests.test.ts`
- Create: `packages/init/test/scan/plan-files.test.ts`
- Create: `packages/init/test/scan/research-files.test.ts`

Three detectors share a pattern: scan the file inventory + read excerpts. Test against the `tiny` fixture extended with planted files.

- [ ] **Step 1: Write the manifests test**

`packages/init/test/scan/manifests.test.ts`:

```ts
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractFixtureRepo } from "../helpers/fixture-repo.js";
import { scanFileInventory } from "../../src/scan/file-inventory.js";
import { detectManifests } from "../../src/scan/manifests.js";

let repoPath: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const fx = await extractFixtureRepo("tiny");
  repoPath = fx.path;
  cleanup = fx.cleanup;
  await mkdir(join(repoPath, "subpkg-ts"), { recursive: true });
  await writeFile(
    join(repoPath, "subpkg-ts", "package.json"),
    JSON.stringify({ name: "@example/sub-ts", version: "0.0.0" }),
  );
  await mkdir(join(repoPath, "subpkg-rust"), { recursive: true });
  await writeFile(
    join(repoPath, "subpkg-rust", "Cargo.toml"),
    'name = "sub-rust"\nversion = "0.1.0"\n',
  );
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

describe("detectManifests", () => {
  it("finds both manifests at depth >= 2", async () => {
    const files = await scanFileInventory(repoPath);
    const manifests = await detectManifests(repoPath, files);
    const byKind = Object.fromEntries(manifests.map((m) => [m.kind, m.name]));
    expect(byKind["package.json"]).toBe("@example/sub-ts");
    expect(byKind["Cargo.toml"]).toBe("sub-rust");
  });

  it("does NOT report a root package.json as a sub-project", async () => {
    await writeFile(
      join(repoPath, "package.json"),
      JSON.stringify({ name: "root-pkg", version: "0.0.0" }),
    );
    const files = await scanFileInventory(repoPath);
    const manifests = await detectManifests(repoPath, files);
    expect(manifests.find((m) => m.name === "root-pkg")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Write the plan-files test**

`packages/init/test/scan/plan-files.test.ts`:

```ts
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractFixtureRepo } from "../helpers/fixture-repo.js";
import { scanFileInventory } from "../../src/scan/file-inventory.js";
import { detectPlanFiles } from "../../src/scan/plan-files.js";

let repoPath: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const fx = await extractFixtureRepo("tiny");
  repoPath = fx.path;
  cleanup = fx.cleanup;
  await mkdir(join(repoPath, "docs/superpowers/plans"), { recursive: true });
  await writeFile(
    join(repoPath, "docs/superpowers/plans/2026-01-01-feature.md"),
    "# Feature Plan\n\nDescription of the feature.\n\n## Tasks\n- a\n- b\n",
  );
  await mkdir(join(repoPath, "planning"), { recursive: true });
  await writeFile(
    join(repoPath, "planning/migration.md"),
    "# Migration\n\nMigration plan body.\n",
  );
  await writeFile(join(repoPath, "PLAN.md"), "# Root plan\n\nText.\n");
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

describe("detectPlanFiles", () => {
  it("finds plan files via the heuristic globs", async () => {
    const files = await scanFileInventory(repoPath);
    const plans = await detectPlanFiles(repoPath, files);
    const paths = plans.map((p) => p.path).sort();
    expect(paths).toEqual([
      "PLAN.md",
      "docs/superpowers/plans/2026-01-01-feature.md",
      "planning/migration.md",
    ]);
  });

  it("captures first-line + 200-char excerpt", async () => {
    const files = await scanFileInventory(repoPath);
    const plans = await detectPlanFiles(repoPath, files);
    const feature = plans.find((p) => p.path.endsWith("feature.md"))!;
    expect(feature.firstLine).toBe("# Feature Plan");
    expect(feature.excerpt.length).toBeGreaterThan(0);
    expect(feature.excerpt.length).toBeLessThanOrEqual(200);
  });
});
```

- [ ] **Step 3: Write the research-files test**

`packages/init/test/scan/research-files.test.ts`:

```ts
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractFixtureRepo } from "../helpers/fixture-repo.js";
import { scanFileInventory } from "../../src/scan/file-inventory.js";
import { detectResearchFiles } from "../../src/scan/research-files.js";

let repoPath: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const fx = await extractFixtureRepo("tiny");
  repoPath = fx.path;
  cleanup = fx.cleanup;
  await mkdir(join(repoPath, "docs/superpowers/research"), { recursive: true });
  await writeFile(
    join(repoPath, "docs/superpowers/research/library-survey.md"),
    "# Library survey\n\nA long research doc.\n",
  );
  await writeFile(join(repoPath, "RESEARCH.md"), "# Root research\n\nText.\n");
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

describe("detectResearchFiles", () => {
  it("finds research files via heuristic globs", async () => {
    const files = await scanFileInventory(repoPath);
    const research = await detectResearchFiles(repoPath, files);
    const paths = research.map((p) => p.path).sort();
    expect(paths).toEqual([
      "RESEARCH.md",
      "docs/superpowers/research/library-survey.md",
    ]);
  });
});
```

- [ ] **Step 4: Run tests — expect 3 failures (module-not-found)**

- [ ] **Step 5: Implementation**

`packages/init/src/scan/manifests.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FileInfo, ManifestInfo } from "../types.js";

const KINDS: Array<{ glob: RegExp; kind: ManifestInfo["kind"]; readName: (raw: string, dir: string) => string }> = [
  {
    glob: /(^|\/)package\.json$/,
    kind: "package.json",
    readName: (raw, dir) => safeJson(raw)?.name ?? dir,
  },
  {
    glob: /(^|\/)Cargo\.toml$/,
    kind: "Cargo.toml",
    readName: (raw, dir) => /^name\s*=\s*"([^"]+)"/m.exec(raw)?.[1] ?? dir,
  },
  {
    glob: /(^|\/)pyproject\.toml$/,
    kind: "pyproject.toml",
    readName: (raw, dir) => /^name\s*=\s*"([^"]+)"/m.exec(raw)?.[1] ?? dir,
  },
  {
    glob: /(^|\/)go\.mod$/,
    kind: "go.mod",
    readName: (raw, dir) => /^module\s+(\S+)/m.exec(raw)?.[1] ?? dir,
  },
  {
    glob: /(^|\/)pom\.xml$/,
    kind: "pom.xml",
    readName: (raw, dir) => /<artifactId>([^<]+)<\/artifactId>/.exec(raw)?.[1] ?? dir,
  },
  {
    glob: /(^|\/)README(\.md)?$/i,
    kind: "readme",
    readName: (raw, dir) => /^#\s+(.+)$/m.exec(raw)?.[1]?.trim() ?? dir,
  },
];

function safeJson(raw: string): { name?: string } | null {
  try { return JSON.parse(raw) as { name?: string }; } catch { return null; }
}

export async function detectManifests(repoRoot: string, files: FileInfo[]): Promise<ManifestInfo[]> {
  const out: ManifestInfo[] = [];
  for (const f of files) {
    // Only depth >= 2 — i.e. at least one slash. Root manifest covered by 00-state.
    if (!f.path.includes("/")) continue;
    for (const kind of KINDS) {
      if (kind.glob.test(f.path)) {
        const raw = await readFile(join(repoRoot, f.path), "utf8");
        const dir = f.path.slice(0, f.path.lastIndexOf("/"));
        out.push({ path: f.path, kind: kind.kind, name: kind.readName(raw, dir) });
        break;
      }
    }
  }
  return out;
}
```

`packages/init/src/scan/plan-files.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FileInfo, PlanFileInfo } from "../types.js";

const PLAN_PATTERNS = [
  /(^|\/)PLAN\.md$/,
  /(^|\/)plan(s)?\/.+\.md$/i,
  /(^|\/)planning\/.+\.md$/i,
  /(^|\/)superpowers\/plans\/.+\.md$/i,
];

function isPlanPath(p: string): boolean {
  return PLAN_PATTERNS.some((re) => re.test(p));
}

function bodyExcerpt(text: string): string {
  const stripped = text
    .split("\n")
    .filter((l) => !l.startsWith("#"))
    .join("\n")
    .trim();
  return stripped.slice(0, 200);
}

export async function detectPlanFiles(repoRoot: string, files: FileInfo[]): Promise<PlanFileInfo[]> {
  const out: PlanFileInfo[] = [];
  for (const f of files) {
    if (!isPlanPath(f.path)) continue;
    const raw = await readFile(join(repoRoot, f.path), "utf8");
    const firstLine = raw.split("\n", 1)[0] ?? "";
    out.push({ path: f.path, firstLine, excerpt: bodyExcerpt(raw) });
  }
  return out;
}
```

`packages/init/src/scan/research-files.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FileInfo, ResearchFileInfo } from "../types.js";

const RESEARCH_PATTERNS = [
  /(^|\/)RESEARCH\.md$/,
  /(^|\/)research\/.+\.md$/i,
  /(^|\/)superpowers\/research\/.+\.md$/i,
];

function isResearchPath(p: string): boolean {
  return RESEARCH_PATTERNS.some((re) => re.test(p));
}

function bodyExcerpt(text: string): string {
  const stripped = text
    .split("\n")
    .filter((l) => !l.startsWith("#"))
    .join("\n")
    .trim();
  return stripped.slice(0, 200);
}

export async function detectResearchFiles(repoRoot: string, files: FileInfo[]): Promise<ResearchFileInfo[]> {
  const out: ResearchFileInfo[] = [];
  for (const f of files) {
    if (!isResearchPath(f.path)) continue;
    const raw = await readFile(join(repoRoot, f.path), "utf8");
    const firstLine = raw.split("\n", 1)[0] ?? "";
    out.push({ path: f.path, firstLine, excerpt: bodyExcerpt(raw) });
  }
  return out;
}
```

- [ ] **Step 6: Run all three test files — expect all green**

- [ ] **Step 7: Stage + parent commits**

```bash
git add packages/init/src/scan/manifests.ts \
        packages/init/src/scan/plan-files.ts \
        packages/init/src/scan/research-files.ts \
        packages/init/test/scan/manifests.test.ts \
        packages/init/test/scan/plan-files.test.ts \
        packages/init/test/scan/research-files.test.ts
```

Parent commit message:

```text
feat(init): manifest / plan / research detectors

Three deterministic scanners that share a file-inventory input.
Manifests find package.json / Cargo.toml / pyproject.toml / go.mod /
pom.xml / README at depth >= 2 (root manifest is the parent project,
not a sub-project). Plans match PLAN.md, plans/, planning/, and
superpowers/plans/ via regex. Research mirrors the same shape for
RESEARCH.md, research/, superpowers/research/.
```

### Task 9: Conversation file detection + agent branches + weekly buckets

**Files:**

- Create: `packages/init/src/scan/conversation-files.ts`
- Create: `packages/init/src/scan/agent-branches.ts`
- Create: `packages/init/src/scan/weekly-buckets.ts`
- Create: `packages/init/test/scan/conversation-files.test.ts`
- Create: `packages/init/test/scan/agent-branches.test.ts`
- Create: `packages/init/test/scan/weekly-buckets.test.ts`

Three independent scanners. Conversation detection re-uses SD2's `dispatchSource` from `@vibe/language`.

- [ ] **Step 1: Write the conversation-files test**

`packages/init/test/scan/conversation-files.test.ts`:

```ts
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractFixtureRepo } from "../helpers/fixture-repo.js";
import { scanFileInventory } from "../../src/scan/file-inventory.js";
import { detectConversationFiles } from "../../src/scan/conversation-files.js";

let repoPath: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const fx = await extractFixtureRepo("tiny");
  repoPath = fx.path;
  cleanup = fx.cleanup;
  await mkdir(join(repoPath, "conversations"), { recursive: true });
  await writeFile(
    join(repoPath, "conversations/brainstorm.vibe"),
    "### user\nHow do we ship X?\n\n### assistant\nProbably with Y.\n\n### user\nOK do it.\n",
  );
  // A non-conversation .vibe file - dispatchSource should classify it differently.
  await writeFile(
    join(repoPath, "conversations/agent.vibe"),
    "agent foo { uses = [plugin.x] }\n",
  );
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

describe("detectConversationFiles", () => {
  it("returns only .vibe files classified as conversations by dispatchSource", async () => {
    const files = await scanFileInventory(repoPath);
    const found = await detectConversationFiles(repoPath, files);
    const paths = found.map((c) => c.path).sort();
    expect(paths).toEqual(["conversations/brainstorm.vibe"]);
  });

  it("counts turns and captures the first user prompt", async () => {
    const files = await scanFileInventory(repoPath);
    const [found] = await detectConversationFiles(repoPath, files);
    expect(found!.turnCount).toBeGreaterThanOrEqual(3);
    expect(found!.firstUserPrompt).toContain("How do we ship X?");
  });
});
```

- [ ] **Step 2: Write the agent-branches test**

`packages/init/test/scan/agent-branches.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractFixtureRepo } from "../helpers/fixture-repo.js";
import { openRepo } from "../../src/scan/git.js";
import { scanCommitLog } from "../../src/scan/commit-log.js";
import { detectAgentBranches } from "../../src/scan/agent-branches.js";

let repoPath: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const fx = await extractFixtureRepo("agents");
  repoPath = fx.path;
  cleanup = fx.cleanup;
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

describe("detectAgentBranches", () => {
  it("groups commits under claude/* and codex/* prefixes", async () => {
    const log = await scanCommitLog(openRepo(repoPath), { maxCount: 1000, allBranches: true });
    const agents = await detectAgentBranches(openRepo(repoPath), log);
    const ids = agents.map((a) => a.id).sort();
    expect(ids).toEqual(["claude", "codex"]);
  });

  it("records branch list, commit count, first-seen, last-seen", async () => {
    const log = await scanCommitLog(openRepo(repoPath), { maxCount: 1000, allBranches: true });
    const agents = await detectAgentBranches(openRepo(repoPath), log);
    const claude = agents.find((a) => a.id === "claude")!;
    expect(claude.branches).toEqual(["claude/feature-1"]);
    expect(claude.commits).toBe(5);
    expect(Date.parse(claude.firstSeen)).toBeLessThanOrEqual(Date.parse(claude.lastSeen));
  });
});
```

- [ ] **Step 3: Write the weekly-buckets test**

`packages/init/test/scan/weekly-buckets.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractFixtureRepo } from "../helpers/fixture-repo.js";
import { openRepo } from "../../src/scan/git.js";
import { scanCommitLog } from "../../src/scan/commit-log.js";
import { computeWeeklyBuckets } from "../../src/scan/weekly-buckets.js";

let repoPath: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const fx = await extractFixtureRepo("agents");
  repoPath = fx.path;
  cleanup = fx.cleanup;
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

describe("computeWeeklyBuckets", () => {
  it("groups commits into ISO weeks", async () => {
    const log = await scanCommitLog(openRepo(repoPath), { maxCount: 1000, allBranches: true });
    const buckets = computeWeeklyBuckets(log);
    expect(buckets.length).toBeGreaterThan(0);
    for (const b of buckets) {
      expect(b.isoWeek).toMatch(/^\d{4}-W\d{2}$/);
      expect(b.commitCount).toBeGreaterThan(0);
    }
  });

  it("sorts buckets descending by week", async () => {
    const log = await scanCommitLog(openRepo(repoPath), { maxCount: 1000, allBranches: true });
    const buckets = computeWeeklyBuckets(log);
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i - 1]!.isoWeek >= buckets[i]!.isoWeek).toBe(true);
    }
  });

  it("captures contributor list per bucket", async () => {
    const log = await scanCommitLog(openRepo(repoPath), { maxCount: 1000, allBranches: true });
    const buckets = computeWeeklyBuckets(log);
    const someoneIsInThere = buckets.some((b) => b.contributors.length > 0);
    expect(someoneIsInThere).toBe(true);
  });
});
```

- [ ] **Step 4: Run tests — 3 module-not-found failures**

- [ ] **Step 5: Implementation**

`packages/init/src/scan/conversation-files.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { detectShape } from "@vibe/language";
import type { ConversationFileInfo, FileInfo } from "../types.js";

const FIRST_USER_PROMPT_RE = /^###\s+user\b[^\n]*\n([\s\S]*?)(?=^###\s+|\Z)/m;
const ROLE_TAG_RE = /^###\s+(user|assistant|system)\b/gm;

export async function detectConversationFiles(repoRoot: string, files: FileInfo[]): Promise<ConversationFileInfo[]> {
  const out: ConversationFileInfo[] = [];
  for (const f of files) {
    if (!f.path.endsWith(".vibe")) continue;
    const raw = await readFile(join(repoRoot, f.path), "utf8");
    if (detectShape(raw) !== "conversation") continue;
    const turnCount = [...raw.matchAll(ROLE_TAG_RE)].length;
    const m = FIRST_USER_PROMPT_RE.exec(raw);
    const firstUserPrompt = (m?.[1] ?? "").trim().slice(0, 200);
    out.push({ path: f.path, turnCount, firstUserPrompt });
  }
  return out;
}
```

`packages/init/src/scan/agent-branches.ts`:

```ts
import type { SimpleGit } from "simple-git";
import type { AgentInfo, CommitInfo } from "../types.js";

const AGENT_PREFIXES = ["claude", "codex", "cursor", "gemini"] as const;

export async function detectAgentBranches(repo: SimpleGit, commits: CommitInfo[]): Promise<AgentInfo[]> {
  const branches = await repo.branch(["--all"]);
  const branchList = Object.keys(branches.branches);

  const byAgent: Record<string, { branches: Set<string>; commitShas: Set<string>; dates: string[] }> = {};
  for (const prefix of AGENT_PREFIXES) {
    byAgent[prefix] = { branches: new Set(), commitShas: new Set(), dates: [] };
  }

  // Collect branches matching each agent prefix.
  for (const fullName of branchList) {
    const local = fullName.replace(/^remotes\/[^/]+\//, "");
    for (const prefix of AGENT_PREFIXES) {
      if (local.startsWith(`${prefix}/`)) {
        byAgent[prefix]!.branches.add(local);
      }
    }
  }

  // Match commits by branch refs OR by author name (case-insensitive).
  // simple-git's log doesn't always populate refs; the cheaper fallback is to
  // match author names against the prefix (e.g. author "Claude" -> claude).
  for (const c of commits) {
    for (const prefix of AGENT_PREFIXES) {
      if (c.author.toLowerCase() === prefix) {
        byAgent[prefix]!.commitShas.add(c.sha);
        byAgent[prefix]!.dates.push(c.date);
      }
    }
  }

  const out: AgentInfo[] = [];
  for (const prefix of AGENT_PREFIXES) {
    const bucket = byAgent[prefix]!;
    if (bucket.branches.size === 0 && bucket.commitShas.size === 0) continue;
    bucket.dates.sort();
    out.push({
      id: prefix,
      branches: [...bucket.branches].sort(),
      commits: bucket.commitShas.size,
      firstSeen: bucket.dates[0] ?? "",
      lastSeen: bucket.dates[bucket.dates.length - 1] ?? "",
    });
  }
  return out;
}
```

`packages/init/src/scan/weekly-buckets.ts`:

```ts
import type { CommitInfo, WeeklyBucket } from "../types.js";

/** ISO week (YYYY-Www) for a date. ISO 8601 weeks start on Monday. */
function isoWeek(d: Date): { week: string; mondayIso: string } {
  // Cribbed from the standard ISO-week algorithm; safe across year boundaries.
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;     // 0 = Monday
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  const weekNo = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  const year = new Date(firstThursday).getUTCFullYear();
  const week = `${year}-W${String(weekNo).padStart(2, "0")}`;

  // Monday of the ISO week
  const monday = new Date(d);
  const offsetToMonday = (d.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - offsetToMonday);
  const mondayIso = monday.toISOString().slice(0, 10);

  return { week, mondayIso };
}

export function computeWeeklyBuckets(commits: CommitInfo[]): WeeklyBucket[] {
  const byWeek = new Map<string, {
    mondayIso: string;
    commits: CommitInfo[];
    contributors: Set<string>;
  }>();

  for (const c of commits) {
    const { week, mondayIso } = isoWeek(new Date(c.date));
    if (!byWeek.has(week)) {
      byWeek.set(week, { mondayIso, commits: [], contributors: new Set() });
    }
    const b = byWeek.get(week)!;
    b.commits.push(c);
    b.contributors.add(c.author);
  }

  const out: WeeklyBucket[] = [];
  for (const [week, b] of byWeek) {
    out.push({
      isoWeek: week,
      startDate: b.mondayIso,
      commitCount: b.commits.length,
      contributors: [...b.contributors].sort(),
      filesChanged: 0,                       // populated later when needed
      subjects: b.commits.slice(0, 20).map((c) => c.subject),
    });
  }
  out.sort((a, b) => b.isoWeek.localeCompare(a.isoWeek));
  return out;
}
```

- [ ] **Step 6: Run tests — 3 suites pass**

- [ ] **Step 7: Stage + parent commits**

```bash
git add packages/init/src/scan/conversation-files.ts \
        packages/init/src/scan/agent-branches.ts \
        packages/init/src/scan/weekly-buckets.ts \
        packages/init/test/scan/conversation-files.test.ts \
        packages/init/test/scan/agent-branches.test.ts \
        packages/init/test/scan/weekly-buckets.test.ts
```

Parent commit message:

```text
feat(init): conversation / agent-branch / weekly-bucket scanners

- Conversation files use SD2's dispatchSource to classify .vibe
  sources as "conversation" shape, then count ### user|assistant
  turns and grab the first user prompt for context.
- Agent branches union branch-prefix matches (claude/foo, codex/bar)
  with author-name matches (commit author "Claude" -> claude).
  Falls back gracefully when simple-git's log doesn't populate refs.
- Weekly buckets group commits into ISO 8601 weeks (Monday-start),
  sorted descending so 50-timeline emits newest-first.
```

### Task 10: Scan orchestrator + HEAD-SHA cache

**Files:**

- Create: `packages/init/src/scan/cache.ts`
- Create: `packages/init/src/scan/index.ts`
- Create: `packages/init/test/scan/cache.test.ts`
- Create: `packages/init/test/scan/scan.test.ts`

- [ ] **Step 1: Write the cache test**

`packages/init/test/scan/cache.test.ts`:

```ts
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readRepoFactsCache,
  writeRepoFactsCache,
  cachePath,
} from "../../src/scan/cache.js";
import type { RepoFacts } from "../../src/types.js";

let dir: string;
let vaultRoot: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vibe-cache-"));
  vaultRoot = join(dir, ".vibe");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const sampleFacts: RepoFacts = {
  repoRoot: "/x",
  identity: { name: "n", primaryLanguage: "TypeScript", defaultBranch: "main" },
  topology: { currentBranch: "main", ahead: 0, behind: 0, dirtyFiles: [], upstream: null },
  commits: [],
  files: [],
  manifests: [],
  planFiles: [],
  researchFiles: [],
  conversationFiles: [],
  agents: [],
  weeklyBuckets: [],
  scannedAt: "2026-05-14T00:00:00Z",
  headSha: "abc123",
};

describe("RepoFacts cache", () => {
  it("returns null when no cache exists", async () => {
    const hit = await readRepoFactsCache(vaultRoot, "abc123");
    expect(hit).toBeNull();
  });

  it("round-trips a write + read", async () => {
    await writeRepoFactsCache(vaultRoot, sampleFacts);
    const hit = await readRepoFactsCache(vaultRoot, "abc123");
    expect(hit?.headSha).toBe("abc123");
    expect(hit?.identity.name).toBe("n");
  });

  it("returns null on a sha mismatch", async () => {
    await writeRepoFactsCache(vaultRoot, sampleFacts);
    const hit = await readRepoFactsCache(vaultRoot, "different-sha");
    expect(hit).toBeNull();
  });

  it("returns null on a corrupted cache file", async () => {
    await writeFile(cachePath(vaultRoot), "not json", "utf8");
    const hit = await readRepoFactsCache(vaultRoot, "abc123");
    expect(hit).toBeNull();
  });
});
```

- [ ] **Step 2: Write the scan-orchestrator test**

`packages/init/test/scan/scan.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractFixtureRepo } from "../helpers/fixture-repo.js";
import { scanRepo } from "../../src/scan/index.js";

let repoPath: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const fx = await extractFixtureRepo("agents");
  repoPath = fx.path;
  cleanup = fx.cleanup;
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

describe("scanRepo", () => {
  it("returns a populated RepoFacts from a real repo", async () => {
    const facts = await scanRepo(repoPath, { commitMaxCount: 5000 });
    expect(facts.repoRoot).toBe(repoPath);
    expect(facts.commits.length).toBeGreaterThan(10);
    expect(facts.agents.length).toBe(2);
    expect(facts.weeklyBuckets.length).toBeGreaterThan(0);
    expect(facts.topology.currentBranch).toBe("main");
    expect(facts.headSha).toMatch(/^[0-9a-f]{40}$/);
  });
});
```

- [ ] **Step 3: Run tests — both fail**

- [ ] **Step 4: Implementation**

`packages/init/src/scan/cache.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RepoFacts } from "../types.js";

export function cachePath(vaultRoot: string): string {
  return join(vaultRoot, ".cache", "repo-facts.json");
}

export async function readRepoFactsCache(vaultRoot: string, headSha: string): Promise<RepoFacts | null> {
  try {
    const raw = await readFile(cachePath(vaultRoot), "utf8");
    const parsed = JSON.parse(raw) as RepoFacts;
    if (parsed.headSha === headSha) return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function writeRepoFactsCache(vaultRoot: string, facts: RepoFacts): Promise<void> {
  const p = cachePath(vaultRoot);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(facts, null, 2), "utf8");
}
```

`packages/init/src/scan/index.ts`:

```ts
import { basename } from "node:path";
import type { RepoFacts } from "../types.js";
import { openRepo } from "./git.js";
import { scanTopology } from "./topology.js";
import { scanCommitLog } from "./commit-log.js";
import { scanFileInventory } from "./file-inventory.js";
import { detectManifests } from "./manifests.js";
import { detectPlanFiles } from "./plan-files.js";
import { detectResearchFiles } from "./research-files.js";
import { detectConversationFiles } from "./conversation-files.js";
import { detectAgentBranches } from "./agent-branches.js";
import { computeWeeklyBuckets } from "./weekly-buckets.js";

export interface ScanOptions {
  commitMaxCount?: number;
  allBranches?: boolean;
}

export async function scanRepo(repoRoot: string, opts: ScanOptions = {}): Promise<RepoFacts> {
  const repo = openRepo(repoRoot);
  const headSha = (await repo.revparse(["HEAD"])).trim();
  const defaultBranch = await detectDefaultBranch(repo);

  const [topology, commits, files] = await Promise.all([
    scanTopology(repo, repoRoot),
    scanCommitLog(repo, {
      maxCount: opts.commitMaxCount ?? 5000,
      allBranches: opts.allBranches ?? true,
    }),
    scanFileInventory(repoRoot),
  ]);

  const [manifests, planFiles, researchFiles, conversationFiles] = await Promise.all([
    detectManifests(repoRoot, files),
    detectPlanFiles(repoRoot, files),
    detectResearchFiles(repoRoot, files),
    detectConversationFiles(repoRoot, files),
  ]);

  const agents = await detectAgentBranches(repo, commits);
  const weeklyBuckets = computeWeeklyBuckets(commits);

  return {
    repoRoot,
    identity: {
      name: basename(repoRoot),
      primaryLanguage: guessPrimaryLanguage(files),
      defaultBranch,
    },
    topology,
    commits,
    files,
    manifests,
    planFiles,
    researchFiles,
    conversationFiles,
    agents,
    weeklyBuckets,
    scannedAt: new Date().toISOString(),
    headSha,
  };
}

async function detectDefaultBranch(repo: ReturnType<typeof openRepo>): Promise<string> {
  try {
    const remote = (await repo.raw(["symbolic-ref", "refs/remotes/origin/HEAD"])).trim();
    return remote.replace(/^refs\/remotes\/origin\//, "") || "main";
  } catch {
    // No remote configured (test fixture case)
    try {
      const local = (await repo.raw(["symbolic-ref", "HEAD"])).trim();
      return local.replace(/^refs\/heads\//, "") || "main";
    } catch {
      return "main";
    }
  }
}

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".rs": "Rust",
  ".go": "Go",
  ".java": "Java",
  ".cs": "C#",
  ".cpp": "C++",
  ".c": "C",
  ".rb": "Ruby",
  ".php": "PHP",
};

function guessPrimaryLanguage(files: import("../types.js").FileInfo[]): string {
  const counts = new Map<string, number>();
  for (const f of files) {
    const i = f.path.lastIndexOf(".");
    if (i < 0) continue;
    const lang = EXT_TO_LANG[f.path.slice(i)];
    if (!lang) continue;
    counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  let best = "(unknown)";
  let bestCount = 0;
  for (const [lang, c] of counts) {
    if (c > bestCount) { best = lang; bestCount = c; }
  }
  return best;
}
```

- [ ] **Step 5: Run tests — both green**

- [ ] **Step 6: Stage + parent commits**

```bash
git add packages/init/src/scan/cache.ts \
        packages/init/src/scan/index.ts \
        packages/init/test/scan/cache.test.ts \
        packages/init/test/scan/scan.test.ts
```

Parent commit message:

```text
feat(init): scanRepo orchestrator + HEAD-SHA RepoFacts cache

scanRepo wires every Phase B scanner into a single RepoFacts producer.
Parallel where independent (topology + log + inventory; then manifests
+ plan + research + conversation in a second wave). Default branch
falls back gracefully when no remote is configured.

Cache lives at <vault>/.cache/repo-facts.json keyed on HEAD SHA.
Corrupted JSON and SHA mismatches both return null so vibe sync
re-runs the scan cleanly.
```

---

## Phase C — Stage 2 deterministic folders (Tasks 11-14)

Each deterministic folder reads `RepoFacts` and emits `NoteSpec[]` with `pipeline: "deterministic"` and a pre-rendered `body`. No resolver calls. No filesystem I/O.

### Task 11: NoteSpec types + emit orchestrator + 00-state

**Files:**

- Modify: `packages/init/src/types.ts` (extend with NoteSpec)
- Create: `packages/init/src/emit/index.ts`
- Create: `packages/init/src/emit/folders/state.ts`
- Create: `packages/init/test/emit/folders/state.test.ts`

- [ ] **Step 1: Extend types**

Append to `packages/init/src/types.ts`:

```ts
export type NotePipeline = "deterministic" | "resolver";

export interface NoteFrontmatter {
  provenance: NotePipeline;
  generated_at: string;          // ISO 8601
  source: string;
  resolver?: {
    provider: string;
    model: string;
    temperature: number;
  };
  cache_key?: string;
  schema_version: number;
  stale?: boolean;
  error?: string;
}

export interface NoteSpec {
  outputPath: string;            // relative to vault root, e.g. "20-agents/codex.md"
  pipeline: NotePipeline;
  source: string;                // matches frontmatter.source
  body?: string;                 // pre-rendered for deterministic; undefined for resolver
  resolverInputs?: {
    promptId: string;
    context: Record<string, unknown>;
    schemaName: string;          // references entries in emit/schemas.ts
  };
  wikilinks: string[];           // outbound vault paths
}
```

- [ ] **Step 2: Write the failing state test**

`packages/init/test/emit/folders/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeStateSpecs } from "../../../src/emit/folders/state.js";
import type { RepoFacts } from "../../../src/types.js";

const sampleFacts: RepoFacts = {
  repoRoot: "/repo",
  identity: { name: "demo", primaryLanguage: "TypeScript", defaultBranch: "main" },
  topology: { currentBranch: "main", ahead: 0, behind: 0, dirtyFiles: [], upstream: "origin/main" },
  commits: [
    { sha: "a".repeat(40), author: "Luther", authorEmail: "l@x", date: "2026-05-14T10:00:00Z", subject: "feat: x", body: "", parents: [], refs: [] },
    { sha: "b".repeat(40), author: "Luther", authorEmail: "l@x", date: "2026-05-13T10:00:00Z", subject: "fix: y", body: "", parents: [], refs: [] },
  ],
  files: [],
  manifests: [],
  planFiles: [],
  researchFiles: [],
  conversationFiles: [],
  agents: [],
  weeklyBuckets: [],
  scannedAt: "2026-05-14T11:00:00Z",
  headSha: "deadbeef",
};

describe("computeStateSpecs", () => {
  it("emits exactly one note at 00-state/README.md", () => {
    const specs = computeStateSpecs(sampleFacts);
    expect(specs).toHaveLength(1);
    expect(specs[0]!.outputPath).toBe("00-state/README.md");
    expect(specs[0]!.pipeline).toBe("deterministic");
  });

  it("renders the repo identity + branch + recent commits in the body", () => {
    const specs = computeStateSpecs(sampleFacts);
    const body = specs[0]!.body!;
    expect(body).toContain("demo");
    expect(body).toContain("TypeScript");
    expect(body).toContain("main");
    expect(body).toContain("feat: x");
    expect(body).toContain("fix: y");
  });

  it("caps recent commits at 5", () => {
    const many = {
      ...sampleFacts,
      commits: Array.from({ length: 10 }, (_, i) => ({
        sha: String(i).repeat(40),
        author: "L",
        authorEmail: "l@x",
        date: `2026-05-${10 - i}T10:00:00Z`,
        subject: `commit ${i}`,
        body: "",
        parents: [],
        refs: [],
      })),
    };
    const body = computeStateSpecs(many)[0]!.body!;
    expect(body).toContain("commit 0");
    expect(body).toContain("commit 4");
    expect(body).not.toContain("commit 5");
  });
});
```

- [ ] **Step 3: Run test — module-not-found**

- [ ] **Step 4: Write state folder**

`packages/init/src/emit/folders/state.ts`:

```ts
import type { NoteSpec, RepoFacts } from "../../types.js";

export function computeStateSpecs(facts: RepoFacts): NoteSpec[] {
  const recent = facts.commits.slice(0, 5);
  const dirty = facts.topology.dirtyFiles.length;
  const upstream = facts.topology.upstream ?? "(none)";

  const lines: string[] = [];
  lines.push(`# ${facts.identity.name}`);
  lines.push("");
  lines.push("## Repo identity");
  lines.push("");
  lines.push(`- **Name:** ${facts.identity.name}`);
  lines.push(`- **Primary language:** ${facts.identity.primaryLanguage}`);
  lines.push(`- **Default branch:** ${facts.identity.defaultBranch}`);
  lines.push("");
  lines.push("## Topology");
  lines.push("");
  lines.push(`- **Current branch:** ${facts.topology.currentBranch}`);
  lines.push(`- **Upstream:** ${upstream}`);
  lines.push(`- **Ahead / behind:** ${facts.topology.ahead} / ${facts.topology.behind}`);
  lines.push(`- **Dirty files:** ${dirty}${dirty > 0 ? " (`" + facts.topology.dirtyFiles.slice(0, 5).join("`, `") + "`)" : ""}`);
  lines.push("");
  lines.push("## Recent commits");
  lines.push("");
  for (const c of recent) {
    lines.push(`- \`${c.sha.slice(0, 7)}\` ${c.subject} — ${c.author}`);
  }
  lines.push("");
  const body = lines.join("\n");

  return [{
    outputPath: "00-state/README.md",
    pipeline: "deterministic",
    source: "git-topology",
    body,
    wikilinks: [],
  }];
}
```

- [ ] **Step 5: emit orchestrator skeleton**

`packages/init/src/emit/index.ts`:

```ts
import type { NoteSpec, RepoFacts } from "../types.js";
import { computeStateSpecs } from "./folders/state.js";

export interface EmitOptions {
  /** When set, only emit specs for the named folder (e.g. "00-state"). */
  onlyFolder?: string;
}

export function emitPlan(facts: RepoFacts, opts: EmitOptions = {}): NoteSpec[] {
  const allSpecs: NoteSpec[] = [];
  allSpecs.push(...computeStateSpecs(facts));
  // Tasks 12+ register more folders here.

  if (opts.onlyFolder) {
    const prefix = `${opts.onlyFolder}/`;
    return allSpecs.filter((s) => s.outputPath.startsWith(prefix));
  }
  return allSpecs;
}
```

- [ ] **Step 6: Tests pass; stage**

```bash
git add packages/init/src/types.ts \
        packages/init/src/emit/index.ts \
        packages/init/src/emit/folders/state.ts \
        packages/init/test/emit/folders/state.test.ts
```

Parent commit message:

```text
feat(init): NoteSpec types + emit orchestrator + 00-state folder

NoteSpec is Stage 2's output shape: outputPath + pipeline +
(body | resolverInputs) + wikilinks. emit/index.ts is the dispatch
table folders register against; --folder filtering is applied at
the orchestrator boundary.

00-state emits one README.md per run with repo identity, topology
(branch / ahead / behind / dirty count), and the last 5 commits.
Deterministic only - no resolver call.
```

### Task 12: 10-projects folder

**Files:**

- Create: `packages/init/src/emit/folders/projects.ts`
- Create: `packages/init/test/emit/folders/projects.test.ts`
- Modify: `packages/init/src/emit/index.ts` (register)

- [ ] **Step 1: Write the failing test**

`packages/init/test/emit/folders/projects.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeProjectsSpecs } from "../../../src/emit/folders/projects.js";
import type { RepoFacts } from "../../../src/types.js";

const facts = {
  repoRoot: "/x",
  identity: { name: "demo", primaryLanguage: "TypeScript", defaultBranch: "main" },
  topology: { currentBranch: "main", ahead: 0, behind: 0, dirtyFiles: [], upstream: null },
  commits: [
    { sha: "a".repeat(40), author: "Alice", authorEmail: "a@x", date: "2026-05-14T10:00:00Z", subject: "feat", body: "", parents: [], refs: [] },
    { sha: "b".repeat(40), author: "Bob",   authorEmail: "b@x", date: "2026-05-13T10:00:00Z", subject: "fix",  body: "", parents: [], refs: [] },
    { sha: "c".repeat(40), author: "Alice", authorEmail: "a@x", date: "2026-05-12T10:00:00Z", subject: "doc",  body: "", parents: [], refs: [] },
  ],
  files: [],
  manifests: [
    { path: "packages/foo/package.json", kind: "package.json", name: "@x/foo" },
    { path: "packages/bar/Cargo.toml", kind: "Cargo.toml", name: "bar-rust" },
  ],
  planFiles: [],
  researchFiles: [],
  conversationFiles: [],
  agents: [],
  weeklyBuckets: [],
  scannedAt: "2026-05-14T11:00:00Z",
  headSha: "deadbeef",
} satisfies RepoFacts;

describe("computeProjectsSpecs", () => {
  it("emits one spec per detected manifest", () => {
    const specs = computeProjectsSpecs(facts);
    expect(specs).toHaveLength(2);
    const paths = specs.map((s) => s.outputPath).sort();
    expect(paths).toEqual(["10-projects/bar-rust.md", "10-projects/foo.md"]);
  });

  it("renders manifest path + kind + primary language + top contributors", () => {
    const specs = computeProjectsSpecs(facts);
    const foo = specs.find((s) => s.outputPath.endsWith("foo.md"))!;
    expect(foo.body).toContain("packages/foo/package.json");
    expect(foo.body).toContain("package.json");
    expect(foo.body).toContain("Alice");
  });
});
```

- [ ] **Step 2: Run — failure**

- [ ] **Step 3: Write the implementation**

`packages/init/src/emit/folders/projects.ts`:

```ts
import type { CommitInfo, ManifestInfo, NoteSpec, RepoFacts } from "../../types.js";

function slugify(name: string): string {
  return name
    .replace(/^@[^/]+\//, "")            // drop npm scope
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function topContributors(commits: CommitInfo[], n: number): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const c of commits) counts.set(c.author, (counts.get(c.author) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, n);
}

function renderProject(facts: RepoFacts, m: ManifestInfo): string {
  const dir = m.path.slice(0, m.path.lastIndexOf("/"));
  const commitsInDir = facts.commits.filter((c) => false); // refined below
  // We don't have per-file commit attribution without an additional log call,
  // so v0 uses repo-wide top contributors. SD5 can refine this per sub-project.
  const top = topContributors(facts.commits, 3);

  const lines: string[] = [];
  lines.push(`# ${m.name}`);
  lines.push("");
  lines.push(`- **Manifest:** \`${m.path}\` (${m.kind})`);
  lines.push(`- **Directory:** \`${dir}\``);
  lines.push(`- **Primary language:** ${facts.identity.primaryLanguage}`);
  lines.push("");
  lines.push("## Top contributors (repo-wide)");
  lines.push("");
  for (const { name, count } of top) {
    lines.push(`- ${name} (${count} commits)`);
  }
  lines.push("");
  return lines.join("\n");
}

export function computeProjectsSpecs(facts: RepoFacts): NoteSpec[] {
  return facts.manifests.map((m) => ({
    outputPath: `10-projects/${slugify(m.name)}.md`,
    pipeline: "deterministic",
    source: "file-inventory",
    body: renderProject(facts, m),
    wikilinks: [],
  }));
}
```

- [ ] **Step 4: Register in the orchestrator**

Edit `packages/init/src/emit/index.ts` to import + push `computeProjectsSpecs(facts)`.

- [ ] **Step 5: Test passes**

- [ ] **Step 6: Stage + parent commits**

```bash
git add packages/init/src/emit/folders/projects.ts \
        packages/init/test/emit/folders/projects.test.ts \
        packages/init/src/emit/index.ts
```

Parent commit message:

```text
feat(init): 10-projects emits one note per detected manifest

Manifest -> slug -> 10-projects/<slug>.md. Body shows manifest
path, kind, primary language, repo-wide top 3 contributors. Per-
manifest contributor attribution defers to SD5 (needs per-file
git log lookups - too heavy for v0).
```

### Task 13: 40-plans + 90-research folders

Same pattern: both are deterministic, both emit one note per detected file with `firstLine` + `excerpt`. Combine into one task to avoid copy-paste fatigue.

**Files:**

- Create: `packages/init/src/emit/folders/plans.ts`
- Create: `packages/init/src/emit/folders/research.ts`
- Create: `packages/init/test/emit/folders/plans.test.ts`
- Create: `packages/init/test/emit/folders/research.test.ts`
- Modify: `packages/init/src/emit/index.ts`

- [ ] **Step 1: Plans test**

`packages/init/test/emit/folders/plans.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computePlansSpecs } from "../../../src/emit/folders/plans.js";
import type { RepoFacts } from "../../../src/types.js";

const facts = {
  repoRoot: "/x",
  identity: { name: "demo", primaryLanguage: "TS", defaultBranch: "main" },
  topology: { currentBranch: "main", ahead: 0, behind: 0, dirtyFiles: [], upstream: null },
  commits: [],
  files: [],
  manifests: [],
  planFiles: [
    { path: "docs/superpowers/plans/2026-05-14-feature.md", firstLine: "# Feature Plan", excerpt: "Feature body excerpt." },
    { path: "PLAN.md", firstLine: "# Root plan", excerpt: "Root body excerpt." },
  ],
  researchFiles: [],
  conversationFiles: [],
  agents: [],
  weeklyBuckets: [],
  scannedAt: "2026-05-14T11:00:00Z",
  headSha: "x",
} satisfies RepoFacts;

describe("computePlansSpecs", () => {
  it("emits one note per plan file", () => {
    const specs = computePlansSpecs(facts);
    expect(specs).toHaveLength(2);
  });

  it("renders source path + first line + excerpt", () => {
    const specs = computePlansSpecs(facts);
    const feature = specs.find((s) => s.outputPath.endsWith("feature.md"))!;
    expect(feature.body).toContain("docs/superpowers/plans/2026-05-14-feature.md");
    expect(feature.body).toContain("# Feature Plan");
    expect(feature.body).toContain("Feature body excerpt");
  });

  it("output slug strips path + .md", () => {
    const specs = computePlansSpecs(facts);
    const paths = specs.map((s) => s.outputPath).sort();
    expect(paths).toEqual(["40-plans/2026-05-14-feature.md", "40-plans/plan.md"]);
  });
});
```

- [ ] **Step 2: Research test (mirrors plans)**

`packages/init/test/emit/folders/research.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeResearchSpecs } from "../../../src/emit/folders/research.js";
import type { RepoFacts } from "../../../src/types.js";

const facts = {
  repoRoot: "/x",
  identity: { name: "demo", primaryLanguage: "TS", defaultBranch: "main" },
  topology: { currentBranch: "main", ahead: 0, behind: 0, dirtyFiles: [], upstream: null },
  commits: [],
  files: [],
  manifests: [],
  planFiles: [],
  researchFiles: [
    { path: "docs/superpowers/research/library-survey.md", firstLine: "# Library survey", excerpt: "Survey excerpt." },
  ],
  conversationFiles: [],
  agents: [],
  weeklyBuckets: [],
  scannedAt: "2026-05-14T11:00:00Z",
  headSha: "x",
} satisfies RepoFacts;

describe("computeResearchSpecs", () => {
  it("emits one note per research file", () => {
    const specs = computeResearchSpecs(facts);
    expect(specs).toHaveLength(1);
    expect(specs[0]!.outputPath).toBe("90-research/library-survey.md");
    expect(specs[0]!.body).toContain("# Library survey");
  });
});
```

- [ ] **Step 3: Run — both fail**

- [ ] **Step 4: Implementation**

`packages/init/src/emit/folders/plans.ts`:

```ts
import type { NoteSpec, PlanFileInfo, RepoFacts } from "../../types.js";

function slugify(path: string): string {
  const base = path.replace(/^.*\//, "").replace(/\.md$/i, "");
  return base
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function renderPlan(p: PlanFileInfo): string {
  return [
    `# ${p.firstLine.replace(/^#+\s*/, "")}`,
    "",
    `- **Source:** [[${p.path}]]`,
    "",
    "## Excerpt",
    "",
    p.excerpt,
    "",
  ].join("\n");
}

export function computePlansSpecs(facts: RepoFacts): NoteSpec[] {
  return facts.planFiles.map((p) => ({
    outputPath: `40-plans/${slugify(p.path)}.md`,
    pipeline: "deterministic",
    source: "plan-detect",
    body: renderPlan(p),
    wikilinks: [],
  }));
}
```

`packages/init/src/emit/folders/research.ts`:

```ts
import type { NoteSpec, RepoFacts, ResearchFileInfo } from "../../types.js";

function slugify(path: string): string {
  const base = path.replace(/^.*\//, "").replace(/\.md$/i, "");
  return base.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function renderResearch(r: ResearchFileInfo): string {
  return [
    `# ${r.firstLine.replace(/^#+\s*/, "")}`,
    "",
    `- **Source:** [[${r.path}]]`,
    "",
    "## Excerpt",
    "",
    r.excerpt,
    "",
  ].join("\n");
}

export function computeResearchSpecs(facts: RepoFacts): NoteSpec[] {
  return facts.researchFiles.map((r) => ({
    outputPath: `90-research/${slugify(r.path)}.md`,
    pipeline: "deterministic",
    source: "research-detect",
    body: renderResearch(r),
    wikilinks: [],
  }));
}
```

- [ ] **Step 5: Register both in `emit/index.ts`**

Append imports + push calls in `emitPlan`:

```ts
import { computePlansSpecs } from "./folders/plans.js";
import { computeResearchSpecs } from "./folders/research.js";

// in emitPlan(), after computeProjectsSpecs:
  allSpecs.push(...computePlansSpecs(facts));
  allSpecs.push(...computeResearchSpecs(facts));
```

- [ ] **Step 6: Both test files pass; stage**

```bash
git add packages/init/src/emit/folders/plans.ts \
        packages/init/src/emit/folders/research.ts \
        packages/init/test/emit/folders/plans.test.ts \
        packages/init/test/emit/folders/research.test.ts \
        packages/init/src/emit/index.ts
```

Parent commit message:

```text
feat(init): 40-plans + 90-research deterministic folders

Both follow the same shape: one note per detected file, body is
title + wikilink-to-source + excerpt. Slug logic strips path +
.md. Plans are read from facts.planFiles; research from
facts.researchFiles (both produced in Phase B).
```

### Task 14: 60-hotspots folder

Hotspots needs per-file commit attribution, which requires walking the commit log diff-by-diff. SD3 v0 uses a simple heuristic: count file paths mentioned in each commit's diffstat. We add a lightweight `filesPerCommit` lookup to RepoFacts.

**Files:**

- Modify: `packages/init/src/types.ts` (extend CommitInfo with `filesChanged: string[]`)
- Modify: `packages/init/src/scan/commit-log.ts` (populate `filesChanged`)
- Modify: `packages/init/test/scan/commit-log.test.ts` (add assertion)
- Create: `packages/init/src/emit/folders/hotspots.ts`
- Create: `packages/init/test/emit/folders/hotspots.test.ts`
- Modify: `packages/init/src/emit/index.ts`

- [ ] **Step 1: Extend CommitInfo**

Edit `packages/init/src/types.ts` and add to CommitInfo:

```ts
  filesChanged: string[];     // path list from --name-only
```

- [ ] **Step 2: Update commit-log scanner**

In `packages/init/src/scan/commit-log.ts`, switch the `git log` invocation from `--pretty=format:...` to a two-pass approach OR include `--name-only` and parse. Simpler: do a second `git log --name-only --pretty=format:%H` pass to build a `sha -> files[]` map, then merge.

Replace `scanCommitLog` body:

```ts
export async function scanCommitLog(repo: SimpleGit, opts: CommitLogOptions): Promise<CommitInfo[]> {
  const baseArgs = ["log", `--max-count=${opts.maxCount}`, "--date=iso-strict"];
  if (opts.allBranches) baseArgs.push("--all");

  // Pass 1: header lines with the field-separated format.
  const raw = await repo.raw([
    ...baseArgs,
    "--pretty=format:%H%x09%an%x09%ae%x09%aI%x09%P%x09%s%x09%b%x00",
  ]);
  const commits = new Map<string, CommitInfo>();
  for (const block of raw.split(" ")) {
    if (!block.trim()) continue;
    const parts = block.split("\t");
    if (parts.length < 7) continue;
    const [sha, author, authorEmail, date, parentsRaw, subject, ...bodyParts] = parts as [
      string, string, string, string, string, string, ...string[]
    ];
    commits.set(sha, {
      sha,
      author,
      authorEmail,
      date,
      subject,
      body: bodyParts.join("\t").replace(/^\n/, "").trimEnd(),
      parents: parentsRaw ? parentsRaw.split(" ").filter(Boolean) : [],
      refs: [],
      filesChanged: [],
    });
  }

  // Pass 2: file lists per commit (--name-only).
  const filesRaw = await repo.raw([...baseArgs, "--name-only", "--pretty=format:%H"]);
  let currentSha = "";
  for (const line of filesRaw.split(/\r?\n/)) {
    if (/^[0-9a-f]{40}$/.test(line)) {
      currentSha = line;
      continue;
    }
    if (!line.trim()) continue;
    const c = commits.get(currentSha);
    if (c) c.filesChanged.push(line);
  }

  return [...commits.values()].sort((a, b) => b.date.localeCompare(a.date));
}
```

Update the existing test in `packages/init/test/scan/commit-log.test.ts` — append:

```ts
  it("populates filesChanged for each commit", async () => {
    const log = await scanCommitLog(openRepo(repoPath), { maxCount: 5, allBranches: true });
    expect(log.some((c) => c.filesChanged.length > 0)).toBe(true);
  });
```

- [ ] **Step 3: Hotspots test**

`packages/init/test/emit/folders/hotspots.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeHotspotsSpecs } from "../../../src/emit/folders/hotspots.js";
import type { RepoFacts } from "../../../src/types.js";

function mkCommit(sha: string, date: string, author: string, files: string[]) {
  return { sha, author, authorEmail: `${author}@x`, date, subject: "x", body: "", parents: [], refs: [], filesChanged: files };
}

const facts = {
  repoRoot: "/x",
  identity: { name: "d", primaryLanguage: "TS", defaultBranch: "main" },
  topology: { currentBranch: "main", ahead: 0, behind: 0, dirtyFiles: [], upstream: null },
  commits: [
    mkCommit("a".repeat(40), "2026-05-14T10:00:00Z", "A", ["src/a.ts", "src/b.ts"]),
    mkCommit("b".repeat(40), "2026-05-13T10:00:00Z", "B", ["src/a.ts"]),
    mkCommit("c".repeat(40), "2026-05-12T10:00:00Z", "A", ["src/a.ts"]),
    mkCommit("d".repeat(40), "2026-05-11T10:00:00Z", "C", ["src/c.ts"]),
  ],
  files: [],
  manifests: [], planFiles: [], researchFiles: [], conversationFiles: [],
  agents: [], weeklyBuckets: [],
  scannedAt: "2026-05-14T11:00:00Z", headSha: "x",
} satisfies RepoFacts;

describe("computeHotspotsSpecs", () => {
  it("emits a README ranking the top files by commit count", () => {
    const specs = computeHotspotsSpecs(facts);
    const readme = specs.find((s) => s.outputPath === "60-hotspots/README.md")!;
    expect(readme.body).toContain("src/a.ts");
    // a.ts has 3 hits, b.ts has 1, c.ts has 1
    const aIdx = readme.body!.indexOf("src/a.ts");
    const bIdx = readme.body!.indexOf("src/b.ts");
    expect(aIdx).toBeLessThan(bIdx);
  });

  it("emits per-file notes only for the top 5", () => {
    const perFile = computeHotspotsSpecs(facts).filter((s) => s.outputPath !== "60-hotspots/README.md");
    expect(perFile.length).toBeLessThanOrEqual(5);
    expect(perFile.length).toBeLessThanOrEqual(facts.commits.flatMap((c) => c.filesChanged).length);
  });
});
```

- [ ] **Step 4: Hotspots implementation**

`packages/init/src/emit/folders/hotspots.ts`:

```ts
import type { CommitInfo, NoteSpec, RepoFacts } from "../../types.js";

interface HotspotRow {
  path: string;
  commitCount: number;
  lastModified: string;
  primaryAuthor: string;
}

function rankHotspots(commits: CommitInfo[]): HotspotRow[] {
  const stats = new Map<string, { count: number; lastDate: string; authors: Map<string, number> }>();
  for (const c of commits) {
    for (const f of c.filesChanged) {
      const s = stats.get(f) ?? { count: 0, lastDate: "", authors: new Map() };
      s.count += 1;
      if (c.date > s.lastDate) s.lastDate = c.date;
      s.authors.set(c.author, (s.authors.get(c.author) ?? 0) + 1);
      stats.set(f, s);
    }
  }
  const rows: HotspotRow[] = [];
  for (const [path, s] of stats) {
    const primaryAuthor = [...s.authors].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
    rows.push({ path, commitCount: s.count, lastModified: s.lastDate, primaryAuthor });
  }
  rows.sort((a, b) => b.commitCount - a.commitCount || a.path.localeCompare(b.path));
  return rows;
}

function slugify(path: string): string {
  return path.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

export function computeHotspotsSpecs(facts: RepoFacts): NoteSpec[] {
  const ranked = rankHotspots(facts.commits);
  const top20 = ranked.slice(0, 20);
  const top5 = ranked.slice(0, 5);

  const lines: string[] = [];
  lines.push("# Hotspots");
  lines.push("");
  lines.push("Files ranked by commit count (top 20):");
  lines.push("");
  lines.push("| Rank | Path | Commits | Last modified | Primary author |");
  lines.push("|------|------|---------|---------------|----------------|");
  top20.forEach((r, i) => {
    lines.push(`| ${i + 1} | \`${r.path}\` | ${r.commitCount} | ${r.lastModified.slice(0, 10)} | ${r.primaryAuthor} |`);
  });
  lines.push("");

  const specs: NoteSpec[] = [{
    outputPath: "60-hotspots/README.md",
    pipeline: "deterministic",
    source: "hotspot-rank",
    body: lines.join("\n"),
    wikilinks: [],
  }];

  for (const r of top5) {
    const body = [
      `# ${r.path}`,
      "",
      `- **Commits:** ${r.commitCount}`,
      `- **Last modified:** ${r.lastModified}`,
      `- **Primary author:** ${r.primaryAuthor}`,
      "",
    ].join("\n");
    specs.push({
      outputPath: `60-hotspots/${slugify(r.path)}.md`,
      pipeline: "deterministic",
      source: "hotspot-rank",
      body,
      wikilinks: [],
    });
  }
  return specs;
}
```

- [ ] **Step 5: Register in `emit/index.ts`**

```ts
import { computeHotspotsSpecs } from "./folders/hotspots.js";
// ...
  allSpecs.push(...computeHotspotsSpecs(facts));
```

- [ ] **Step 6: Tests pass; stage**

```bash
git add packages/init/src/types.ts \
        packages/init/src/scan/commit-log.ts \
        packages/init/test/scan/commit-log.test.ts \
        packages/init/src/emit/folders/hotspots.ts \
        packages/init/test/emit/folders/hotspots.test.ts \
        packages/init/src/emit/index.ts
```

Parent commit message:

```text
feat(init): 60-hotspots ranks files by commit count + extends CommitInfo

CommitInfo now carries filesChanged: string[] populated by a second
git log --name-only pass. computeHotspotsSpecs aggregates per-file
commit counts, sorts descending, emits a top-20 README table plus
one per-file note for the top 5. Primary author is the author with
the most commits touching the file.
```

---

## Phase D — Stage 3 write + frontmatter contract (Tasks 15-19)

Five tasks build the write-side mechanics. None of them touch real I/O in unit tests — everything goes through an `InMemoryVault` abstraction (`Map<path, content>`).

### Task 15: Frontmatter read/write helpers

**Files:**

- Create: `packages/init/src/write/frontmatter.ts`
- Create: `packages/init/test/write/frontmatter.test.ts`
- Modify: `packages/init/package.json` (add `gray-matter@^4`, `zod@^4`)

- [ ] **Step 1: Add dependencies**

```bash
pnpm --filter @vibe/init add gray-matter@^4 zod@^4
```

- [ ] **Step 2: Write the failing test**

`packages/init/test/write/frontmatter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  parseFrontmatter,
  serializeFrontmatter,
  type NoteFile,
} from "../../src/write/frontmatter.js";

const sample: NoteFile = {
  frontmatter: {
    provenance: "deterministic",
    generated_at: "2026-05-14T07:42:00Z",
    source: "git-topology",
    schema_version: 1,
  },
  body: "# Body\n\nContent.\n",
};

describe("parseFrontmatter", () => {
  it("returns null frontmatter when none is present", () => {
    const f = parseFrontmatter("# Just a heading\n\nNo frontmatter.\n");
    expect(f.frontmatter).toBeNull();
    expect(f.body).toContain("Just a heading");
  });

  it("parses a valid vibe frontmatter block", () => {
    const raw = [
      "---",
      "vibe:",
      "  provenance: deterministic",
      "  generated_at: 2026-05-14T07:42:00Z",
      "  source: git-topology",
      "  schema_version: 1",
      "---",
      "# Body",
      "",
    ].join("\n");
    const f = parseFrontmatter(raw);
    expect(f.frontmatter?.provenance).toBe("deterministic");
    expect(f.frontmatter?.source).toBe("git-topology");
    expect(f.body).toContain("# Body");
  });

  it("returns null frontmatter for malformed YAML (treats as human)", () => {
    const raw = "---\nnot: valid: yaml:\n---\n# body\n";
    const f = parseFrontmatter(raw);
    expect(f.frontmatter).toBeNull();
  });

  it("returns null frontmatter when vibe key is missing", () => {
    const raw = "---\nfoo: bar\n---\n# body\n";
    const f = parseFrontmatter(raw);
    expect(f.frontmatter).toBeNull();
  });

  it("rejects frontmatter with an invalid provenance value", () => {
    const raw = [
      "---",
      "vibe:",
      "  provenance: nope",
      "  generated_at: 2026-05-14T07:42:00Z",
      "  source: x",
      "  schema_version: 1",
      "---",
      "# body",
      "",
    ].join("\n");
    const f = parseFrontmatter(raw);
    expect(f.frontmatter).toBeNull();
  });
});

describe("serializeFrontmatter", () => {
  it("emits frontmatter + body in canonical form", () => {
    const out = serializeFrontmatter(sample);
    expect(out.startsWith("---\nvibe:\n")).toBe(true);
    expect(out).toContain("provenance: deterministic");
    expect(out).toContain("\n---\n# Body");
  });

  it("round-trips through parseFrontmatter", () => {
    const raw = serializeFrontmatter(sample);
    const parsed = parseFrontmatter(raw);
    expect(parsed.frontmatter?.provenance).toBe("deterministic");
    expect(parsed.body.trim()).toBe(sample.body.trim());
  });
});
```

- [ ] **Step 3: Run — module-not-found**

- [ ] **Step 4: Implementation**

`packages/init/src/write/frontmatter.ts`:

```ts
import matter from "gray-matter";
import { z } from "zod";
import type { NoteFrontmatter } from "../types.js";

export interface NoteFile {
  frontmatter: NoteFrontmatter | null;
  body: string;
}

const FrontmatterSchema = z.object({
  provenance: z.enum(["deterministic", "resolver", "human"]),
  generated_at: z.string(),
  source: z.string(),
  resolver: z.object({
    provider: z.string(),
    model: z.string(),
    temperature: z.number(),
  }).optional(),
  cache_key: z.string().optional(),
  schema_version: z.number(),
  stale: z.boolean().optional(),
  error: z.string().optional(),
});

export function parseFrontmatter(raw: string): NoteFile {
  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(raw);
  } catch {
    return { frontmatter: null, body: raw };
  }
  const data = parsed.data as Record<string, unknown>;
  const candidate = data.vibe;
  if (!candidate) return { frontmatter: null, body: parsed.content };
  const result = FrontmatterSchema.safeParse(candidate);
  if (!result.success) return { frontmatter: null, body: parsed.content };
  return { frontmatter: result.data, body: parsed.content };
}

export function serializeFrontmatter(note: NoteFile): string {
  if (!note.frontmatter) return note.body;
  const yamlBody = matter.stringify(note.body, { vibe: note.frontmatter });
  return yamlBody;
}
```

- [ ] **Step 5: Tests pass; stage**

```bash
git add packages/init/src/write/frontmatter.ts \
        packages/init/test/write/frontmatter.test.ts \
        packages/init/package.json pnpm-lock.yaml
```

Parent commit:

```text
feat(init): YAML frontmatter read/write with Zod validation

Wraps gray-matter for serialization. Read path validates against a
Zod schema; any deviation (missing vibe key, invalid provenance,
malformed YAML) returns null so the refresh-rules layer treats the
file as human-authored. Schema mirrors the §4 contract from the
SD3 design spec.

Adds gray-matter@4, zod@4 to deps.
```

### Task 16: Refresh rules

**Files:**

- Create: `packages/init/src/write/refresh-rules.ts`
- Create: `packages/init/test/write/refresh-rules.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/init/test/write/refresh-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decideAction } from "../../src/write/refresh-rules.js";
import type { NoteFrontmatter, NoteSpec } from "../../src/types.js";

function det(source: string): NoteFrontmatter {
  return { provenance: "deterministic", generated_at: "2026-01-01T00:00:00Z", source, schema_version: 1 };
}

function res(cacheKey: string): NoteFrontmatter {
  return {
    provenance: "resolver",
    generated_at: "2026-01-01T00:00:00Z",
    source: "decisions-cluster",
    schema_version: 1,
    resolver: { provider: "cerebras.glm_4_7", model: "zai-glm-4.7", temperature: 0.3 },
    cache_key: cacheKey,
  };
}

const detSpec: NoteSpec = {
  outputPath: "00-state/README.md",
  pipeline: "deterministic",
  source: "git-topology",
  body: "# Body\n",
  wikilinks: [],
};

const resSpec: NoteSpec = {
  outputPath: "30-decisions/feature-x.md",
  pipeline: "resolver",
  source: "decisions-cluster",
  resolverInputs: { promptId: "decision-v1", context: {}, schemaName: "decision" },
  wikilinks: [],
};

describe("decideAction", () => {
  it("writes when the file does not yet exist", () => {
    expect(decideAction(detSpec, null).kind).toBe("write");
    expect(decideAction(resSpec, null).kind).toBe("resolver-call");
  });

  it("skips when existing file is human-tagged", () => {
    expect(decideAction(detSpec, det("git-topology")).provenance ?? null).not.toBe("human");
    const action = decideAction(detSpec, { ...det("git-topology"), provenance: "human" });
    expect(action.kind).toBe("skip");
    expect(action.reason).toContain("human");
  });

  it("treats missing frontmatter as human", () => {
    const action = decideAction(detSpec, null, /*hadRawFile=*/true);
    expect(action.kind).toBe("skip");
  });

  it("regenerates deterministic files unconditionally", () => {
    const action = decideAction(detSpec, det("git-topology"));
    expect(action.kind).toBe("write");
  });

  it("skips resolver files when cache_key matches", () => {
    const action = decideAction(resSpec, res("key-A"), /*hadRawFile=*/false, "key-A");
    expect(action.kind).toBe("cached");
  });

  it("re-runs resolver when cache_key differs", () => {
    const action = decideAction(resSpec, res("key-A"), /*hadRawFile=*/false, "key-B");
    expect(action.kind).toBe("resolver-call");
  });

  it("re-runs resolver when stored frontmatter has no cache_key", () => {
    const stripped: NoteFrontmatter = { ...res("key-A") };
    delete (stripped as any).cache_key;
    const action = decideAction(resSpec, stripped, false, "key-A");
    expect(action.kind).toBe("resolver-call");
  });
});
```

- [ ] **Step 2: Run — failure**

- [ ] **Step 3: Implementation**

`packages/init/src/write/refresh-rules.ts`:

```ts
import type { NoteFrontmatter, NoteSpec } from "../types.js";

export type Action =
  | { kind: "write" }
  | { kind: "resolver-call" }
  | { kind: "cached" }
  | { kind: "skip"; reason: string };

/**
 * Decide what Stage 3 should do for a single NoteSpec given the existing
 * file's frontmatter (or null if the file does not exist OR exists but has
 * no valid vibe frontmatter — the caller signals via hadRawFile).
 *
 * For resolver pipelines, the caller passes the freshly-computed cache_key
 * so the decision can compare against the stored value.
 */
export function decideAction(
  spec: NoteSpec,
  existing: NoteFrontmatter | null,
  hadRawFile: boolean = false,
  freshCacheKey?: string,
): Action {
  // The file exists on disk but has no valid vibe frontmatter -> human.
  if (existing === null && hadRawFile) {
    return { kind: "skip", reason: "no vibe frontmatter (treated as human)" };
  }

  // The file does not exist yet -> write fresh.
  if (existing === null) {
    return spec.pipeline === "resolver" ? { kind: "resolver-call" } : { kind: "write" };
  }

  if (existing.provenance === "human") {
    return { kind: "skip", reason: "frontmatter says human" };
  }

  if (spec.pipeline === "deterministic") {
    return { kind: "write" };
  }

  // Resolver pipeline: compare cache_key.
  if (existing.cache_key && freshCacheKey && existing.cache_key === freshCacheKey) {
    return { kind: "cached" };
  }
  return { kind: "resolver-call" };
}
```

- [ ] **Step 4: Tests pass; stage**

```bash
git add packages/init/src/write/refresh-rules.ts \
        packages/init/test/write/refresh-rules.test.ts
```

Parent commit:

```text
feat(init): refresh-rules decision tree for sync semantics

decideAction(spec, existingFrontmatter, hadRawFile, freshCacheKey)
returns one of: write | resolver-call | cached | skip{reason}.
Encodes the §4 contract from the SD3 spec:
- Missing/malformed frontmatter -> human (skip).
- provenance: human -> skip.
- Deterministic -> always write.
- Resolver -> cached if cache_key matches; else resolver-call.
```

### Task 17: Note rendering (frontmatter + body + wikilinks footer)

**Files:**

- Create: `packages/init/src/write/render-note.ts`
- Create: `packages/init/test/write/render-note.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/init/test/write/render-note.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderNote } from "../../src/write/render-note.js";
import type { NoteFrontmatter, NoteSpec } from "../../src/types.js";

const fm: NoteFrontmatter = {
  provenance: "deterministic",
  generated_at: "2026-05-14T07:42:00Z",
  source: "git-topology",
  schema_version: 1,
};

const specWithLinks: NoteSpec = {
  outputPath: "00-state/README.md",
  pipeline: "deterministic",
  source: "git-topology",
  body: "# Body\n\nContent.\n",
  wikilinks: ["10-projects/foo", "40-plans/feature"],
};

const specNoLinks: NoteSpec = { ...specWithLinks, wikilinks: [] };

describe("renderNote", () => {
  it("emits frontmatter then body then See also footer", () => {
    const out = renderNote(specWithLinks, fm);
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain("provenance: deterministic");
    expect(out).toContain("# Body");
    expect(out).toContain("## See also");
    expect(out).toContain("[[10-projects/foo]]");
    expect(out).toContain("[[40-plans/feature]]");
  });

  it("omits the See also footer when no wikilinks", () => {
    const out = renderNote(specNoLinks, fm);
    expect(out).not.toContain("## See also");
  });

  it("always ends with a single trailing newline", () => {
    const out = renderNote(specNoLinks, fm);
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });
});
```

- [ ] **Step 2: Implementation**

`packages/init/src/write/render-note.ts`:

```ts
import type { NoteFrontmatter, NoteSpec } from "../types.js";
import { serializeFrontmatter, type NoteFile } from "./frontmatter.js";

export function renderNote(spec: NoteSpec, frontmatter: NoteFrontmatter): string {
  const body = spec.body ?? "";
  const footer = spec.wikilinks.length > 0
    ? "\n\n## See also\n\n" + spec.wikilinks.map((link) => `- [[${link}]]`).join("\n") + "\n"
    : "";
  const note: NoteFile = { frontmatter, body: body.trimEnd() + footer };
  const rendered = serializeFrontmatter(note);
  return rendered.endsWith("\n") ? rendered : rendered + "\n";
}
```

- [ ] **Step 3: Tests pass; stage + commit**

```bash
git add packages/init/src/write/render-note.ts \
        packages/init/test/write/render-note.test.ts
```

Commit:

```text
feat(init): renderNote composes frontmatter + body + See also footer

Wikilinks render as `- [[path]]` bullets under a `## See also`
heading. Empty wikilinks array omits the heading entirely.
Trailing newline normalized to exactly one so diff-before-write
does not flap on mtime when a generator emits with vs without a
trailing newline.
```

### Task 18: Diff-before-write

**Files:**

- Create: `packages/init/src/write/diff.ts`
- Create: `packages/init/test/write/diff.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/init/test/write/diff.test.ts`:

```ts
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeIfChanged } from "../../src/write/diff.js";

let dir: string;

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vibe-diff-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe("writeIfChanged", () => {
  it("creates the file when it does not exist", async () => {
    const p = join(dir, "a.md");
    const result = await writeIfChanged(p, "hello\n");
    expect(result).toBe("wrote");
    expect(await readFile(p, "utf8")).toBe("hello\n");
  });

  it("does not touch the file when content is byte-identical", async () => {
    const p = join(dir, "b.md");
    await writeFile(p, "stable\n", "utf8");
    const beforeMtime = (await stat(p)).mtimeMs;
    await new Promise((r) => setTimeout(r, 20));
    const result = await writeIfChanged(p, "stable\n");
    expect(result).toBe("unchanged");
    const afterMtime = (await stat(p)).mtimeMs;
    expect(afterMtime).toBe(beforeMtime);
  });

  it("overwrites when content differs", async () => {
    const p = join(dir, "c.md");
    await writeFile(p, "old\n", "utf8");
    const result = await writeIfChanged(p, "new\n");
    expect(result).toBe("wrote");
    expect(await readFile(p, "utf8")).toBe("new\n");
  });

  it("creates parent directories as needed", async () => {
    const p = join(dir, "deep/nested/file.md");
    const result = await writeIfChanged(p, "x\n");
    expect(result).toBe("wrote");
    expect(await readFile(p, "utf8")).toBe("x\n");
  });
});
```

- [ ] **Step 2: Implementation**

`packages/init/src/write/diff.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type WriteResult = "wrote" | "unchanged";

export async function writeIfChanged(path: string, content: string): Promise<WriteResult> {
  let existing: string | null = null;
  try {
    existing = await readFile(path, "utf8");
  } catch {
    existing = null;
  }
  if (existing === content) return "unchanged";
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return "wrote";
}
```

- [ ] **Step 3: Stage + commit**

```bash
git add packages/init/src/write/diff.ts packages/init/test/write/diff.test.ts
```

```text
feat(init): writeIfChanged preserves mtime when bytes match

Reads the target, compares byte-for-byte, only writes when content
differs. Creates parent directories as needed. Preserves the existing
mtime when the file is unchanged so Obsidian's "recently modified"
view stays meaningful across vibe sync runs.
```

### Task 19: Stale marking + last-run.json report

**Files:**

- Create: `packages/init/src/write/stale.ts`
- Create: `packages/init/src/report.ts`
- Create: `packages/init/test/write/stale.test.ts`

- [ ] **Step 1: Write the stale test**

`packages/init/test/write/stale.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { markStale, type StaleInput } from "../../src/write/stale.js";

describe("markStale", () => {
  it("adds stale: true to the frontmatter and a comment to the body", () => {
    const input: StaleInput = {
      existingFrontmatter: {
        provenance: "resolver",
        generated_at: "2026-01-01T00:00:00Z",
        source: "decisions-cluster",
        schema_version: 1,
      },
      existingBody: "# Old decision\n\nText.\n",
      reason: "source cluster removed",
      now: "2026-05-14T07:42:00Z",
    };
    const out = markStale(input);
    expect(out.frontmatter.stale).toBe(true);
    expect(out.body.startsWith("<!-- vibe-stale:")).toBe(true);
    expect(out.body).toContain("source cluster removed");
    expect(out.body).toContain("2026-05-14T07:42:00Z");
    expect(out.body).toContain("# Old decision");
  });

  it("does not prepend a second comment if one already exists", () => {
    const input: StaleInput = {
      existingFrontmatter: {
        provenance: "resolver",
        generated_at: "2026-01-01T00:00:00Z",
        source: "decisions-cluster",
        schema_version: 1,
        stale: true,
      },
      existingBody: "<!-- vibe-stale: prior reason at 2026-04-01T00:00:00Z -->\n\n# Body\n",
      reason: "still gone",
      now: "2026-05-14T07:42:00Z",
    };
    const out = markStale(input);
    const occurrences = (out.body.match(/<!-- vibe-stale:/g) ?? []).length;
    expect(occurrences).toBe(1);
  });
});
```

- [ ] **Step 2: Implementation**

`packages/init/src/write/stale.ts`:

```ts
import type { NoteFrontmatter } from "../types.js";

export interface StaleInput {
  existingFrontmatter: NoteFrontmatter;
  existingBody: string;
  reason: string;
  now: string;
}

export interface StaleOutput {
  frontmatter: NoteFrontmatter;
  body: string;
}

export function markStale(input: StaleInput): StaleOutput {
  const frontmatter: NoteFrontmatter = { ...input.existingFrontmatter, stale: true };
  const comment = `<!-- vibe-stale: ${input.reason} at ${input.now} -->`;
  const body = input.existingBody.includes("<!-- vibe-stale:")
    ? input.existingBody
    : `${comment}\n\n${input.existingBody}`;
  return { frontmatter, body };
}
```

- [ ] **Step 3: Report module**

`packages/init/src/report.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type NoteStatus = "wrote" | "skipped" | "cached" | "failed";

export interface NoteReport {
  outputPath: string;
  status: NoteStatus;
  reason?: string;
  error?: string;
  cacheKey?: string;
}

export interface RunReport {
  startedAt: string;
  finishedAt: string;
  command: "init" | "sync";
  repoRoot: string;
  vaultRoot: string;
  shape: { totalSpecs: number; written: number; skipped: number; cached: number; failed: number };
  notes: NoteReport[];
}

export function reportPath(vaultRoot: string): string {
  return join(vaultRoot, ".cache", "last-run.json");
}

export async function writeRunReport(report: RunReport): Promise<void> {
  const p = reportPath(report.vaultRoot);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(report, null, 2), "utf8");
}
```

- [ ] **Step 4: Stage + commit**

```bash
git add packages/init/src/write/stale.ts \
        packages/init/src/report.ts \
        packages/init/test/write/stale.test.ts
```

```text
feat(init): stale marking + last-run.json report shape

markStale tags a note's frontmatter with stale: true and prepends a
<!-- vibe-stale: reason at timestamp --> comment to the body. Idempotent:
re-running on an already-stale note leaves the body alone.

report.ts declares the RunReport / NoteReport shapes Stage 3 writes
to <vault>/.cache/last-run.json. Used by the CLI's exit code logic
(non-zero on any failed: N > 0) and by humans grepping for errors.
```

---

## Phase E — Stage 2 resolver folders (Tasks 20-23)

Two pure-resolver folders (30-decisions, 70-glossary) plus the shared prompt + schema infrastructure. Recorded-fixture tests live with each folder.

### Task 20: Resolver prompts + schemas + cache-key helper

**Files:**

- Create: `packages/init/src/emit/prompts.ts`
- Create: `packages/init/src/emit/schemas.ts`
- Create: `packages/init/src/emit/cache-key.ts`
- Create: `packages/init/test/emit/prompts.test.ts`
- Create: `packages/init/test/emit/schemas.test.ts`
- Create: `packages/init/test/emit/cache-key.test.ts`

- [ ] **Step 1: Tests first**

`packages/init/test/emit/prompts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPrompt, type PromptId } from "../../src/emit/prompts.js";

describe("buildPrompt", () => {
  const ids: PromptId[] = ["decision-v1", "glossary-v1", "agent-identity-v1", "weekly-summary-v1", "conversation-summary-v1"];

  it("returns a non-empty system + user prompt for every registered id", () => {
    for (const id of ids) {
      const { system, user } = buildPrompt(id, { sampleField: "x" });
      expect(system.length).toBeGreaterThan(50);
      expect(user.length).toBeGreaterThan(10);
    }
  });

  it("interpolates context into the user prompt", () => {
    const { user } = buildPrompt("agent-identity-v1", {
      agentId: "codex",
      commits: ["feat: a", "fix: b"],
    });
    expect(user).toContain("codex");
    expect(user).toContain("feat: a");
  });

  it("throws on an unknown prompt id", () => {
    expect(() => buildPrompt("nope" as PromptId, {})).toThrow(/unknown prompt/i);
  });
});
```

`packages/init/test/emit/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getSchema, type SchemaName } from "../../src/emit/schemas.js";

const names: SchemaName[] = ["decision", "glossary-term", "agent-identity", "weekly-summary", "conversation-summary"];

describe("getSchema", () => {
  it("returns a Zod schema for every registered name", () => {
    for (const name of names) {
      const schema = getSchema(name);
      expect(schema).toBeDefined();
      expect(typeof schema.parse).toBe("function");
    }
  });

  it("decision schema validates a well-formed object", () => {
    const schema = getSchema("decision");
    const parsed = schema.parse({
      title: "Switched to Cerebras",
      summary: "Moved the default resolver provider from OpenAI to Cerebras.",
      commits: ["a".repeat(40)],
      revertedShas: [],
    });
    expect(parsed.title).toBe("Switched to Cerebras");
  });

  it("decision schema rejects an object missing required fields", () => {
    const schema = getSchema("decision");
    expect(() => schema.parse({ title: "x" })).toThrow();
  });

  it("throws on an unknown schema name", () => {
    expect(() => getSchema("nope" as SchemaName)).toThrow(/unknown schema/i);
  });
});
```

`packages/init/test/emit/cache-key.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeNoteCacheKey } from "../../src/emit/cache-key.js";

describe("computeNoteCacheKey", () => {
  it("returns a stable sha256 hex for the same inputs", () => {
    const a = computeNoteCacheKey({ promptId: "decision-v1", context: { x: 1 }, model: "zai-glm-4.7", temperature: 0.3 });
    const b = computeNoteCacheKey({ promptId: "decision-v1", context: { x: 1 }, model: "zai-glm-4.7", temperature: 0.3 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when context changes", () => {
    const a = computeNoteCacheKey({ promptId: "decision-v1", context: { x: 1 }, model: "m", temperature: 0.3 });
    const b = computeNoteCacheKey({ promptId: "decision-v1", context: { x: 2 }, model: "m", temperature: 0.3 });
    expect(a).not.toBe(b);
  });

  it("is order-insensitive for object keys (stable JSON)", () => {
    const a = computeNoteCacheKey({ promptId: "p", context: { x: 1, y: 2 }, model: "m", temperature: 0.3 });
    const b = computeNoteCacheKey({ promptId: "p", context: { y: 2, x: 1 }, model: "m", temperature: 0.3 });
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Implementations**

`packages/init/src/emit/prompts.ts`:

```ts
export type PromptId =
  | "decision-v1"
  | "glossary-v1"
  | "agent-identity-v1"
  | "weekly-summary-v1"
  | "conversation-summary-v1";

export interface BuiltPrompt {
  system: string;
  user: string;
}

const SYSTEM_HEADER = [
  "You are the Vibe vault note generator.",
  "Vibe is a hybrid specification language; you are producing a typed structured",
  "summary that will be validated against a Zod schema and written into an",
  "Obsidian-compatible vault. Constraints:",
  "- Output must conform to the provided JSON schema.",
  "- Do not invent identifiers that are not in the context.",
  "- Prefer omitting an optional field over guessing.",
].join("\n");

const TEMPLATES: Record<PromptId, (ctx: Record<string, unknown>) => string> = {
  "decision-v1": (ctx) => [
    "You are summarizing a single decision made in this project.",
    "",
    "Cluster commits for this decision:",
    JSON.stringify(ctx.commits ?? [], null, 2),
    "",
    ctx.revertedShas ? `Reverted commits in the cluster: ${JSON.stringify(ctx.revertedShas)}` : "",
    "",
    "Produce a typed decision summary.",
  ].filter(Boolean).join("\n"),

  "glossary-v1": (ctx) => [
    "You are extracting domain vocabulary from this project.",
    "",
    "Source spans (commit messages, plan excerpts, conversation turns):",
    JSON.stringify(ctx.spans ?? [], null, 2),
    "",
    "Return a single glossary term with a one-line gloss + the source spans",
    `it appears in. Term name: ${ctx.term ?? "(infer from spans)"}.`,
  ].join("\n"),

  "agent-identity-v1": (ctx) => [
    "Summarize what this AI agent works on in this repository.",
    "",
    `Agent id: ${ctx.agentId ?? "(unknown)"}.`,
    `Branches: ${JSON.stringify(ctx.branches ?? [])}.`,
    "",
    "Commit subjects:",
    JSON.stringify(ctx.commits ?? [], null, 2),
    "",
    "Return one short paragraph describing the agent's focus area.",
  ].join("\n"),

  "weekly-summary-v1": (ctx) => [
    "Summarize what happened in this repo during one ISO week.",
    "",
    `Week: ${ctx.isoWeek ?? "(unknown)"}.`,
    `Commit count: ${ctx.commitCount ?? 0}.`,
    `Contributors: ${JSON.stringify(ctx.contributors ?? [])}.`,
    "",
    "Commit subjects:",
    JSON.stringify(ctx.subjects ?? [], null, 2),
    "",
    "Return one short paragraph.",
  ].join("\n"),

  "conversation-summary-v1": (ctx) => [
    "Summarize a conversation transcript from this project.",
    "",
    `Source path: ${ctx.path ?? "(unknown)"}.`,
    `Turn count: ${ctx.turnCount ?? 0}.`,
    `First user prompt: ${ctx.firstUserPrompt ?? ""}`,
    "",
    "Full transcript:",
    String(ctx.transcript ?? "").slice(0, 8000),
    "",
    "Return one short paragraph plus an array of key decisions extracted.",
  ].join("\n"),
};

export function buildPrompt(id: PromptId, context: Record<string, unknown>): BuiltPrompt {
  const tmpl = TEMPLATES[id];
  if (!tmpl) throw new Error(`unknown prompt: ${String(id)}`);
  return { system: SYSTEM_HEADER, user: tmpl(context) };
}
```

`packages/init/src/emit/schemas.ts`:

```ts
import { z, type ZodTypeAny } from "zod";

export type SchemaName =
  | "decision"
  | "glossary-term"
  | "agent-identity"
  | "weekly-summary"
  | "conversation-summary";

const Decision = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  commits: z.array(z.string().regex(/^[0-9a-f]{7,40}$/)),
  revertedShas: z.array(z.string().regex(/^[0-9a-f]{7,40}$/)).default([]),
});

const GlossaryTerm = z.object({
  term: z.string().min(1),
  gloss: z.string().min(1),
  sources: z.array(z.string()).default([]),
});

const AgentIdentity = z.object({
  paragraph: z.string().min(1),
  themes: z.array(z.string()).default([]),
});

const WeeklySummary = z.object({
  paragraph: z.string().min(1),
});

const ConversationSummary = z.object({
  paragraph: z.string().min(1),
  decisions: z.array(z.string()).default([]),
});

const SCHEMAS: Record<SchemaName, ZodTypeAny> = {
  decision: Decision,
  "glossary-term": GlossaryTerm,
  "agent-identity": AgentIdentity,
  "weekly-summary": WeeklySummary,
  "conversation-summary": ConversationSummary,
};

export function getSchema(name: SchemaName): ZodTypeAny {
  const s = SCHEMAS[name];
  if (!s) throw new Error(`unknown schema: ${String(name)}`);
  return s;
}

export type DecisionShape = z.infer<typeof Decision>;
export type GlossaryTermShape = z.infer<typeof GlossaryTerm>;
export type AgentIdentityShape = z.infer<typeof AgentIdentity>;
export type WeeklySummaryShape = z.infer<typeof WeeklySummary>;
export type ConversationSummaryShape = z.infer<typeof ConversationSummary>;
```

`packages/init/src/emit/cache-key.ts`:

```ts
import { createHash } from "node:crypto";
import type { PromptId } from "./prompts.js";

export interface CacheKeyInput {
  promptId: PromptId | string;
  context: Record<string, unknown>;
  model: string;
  temperature: number;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

export function computeNoteCacheKey(input: CacheKeyInput): string {
  const hash = createHash("sha256");
  hash.update("note-v1\n");
  hash.update(input.promptId + "\n");
  hash.update(stableStringify(input.context) + "\n");
  hash.update(input.model + "\n");
  hash.update(String(input.temperature) + "\n");
  return hash.digest("hex");
}
```

- [ ] **Step 3: Tests pass; stage**

```bash
git add packages/init/src/emit/prompts.ts \
        packages/init/src/emit/schemas.ts \
        packages/init/src/emit/cache-key.ts \
        packages/init/test/emit/prompts.test.ts \
        packages/init/test/emit/schemas.test.ts \
        packages/init/test/emit/cache-key.test.ts
```

Parent commit:

```text
feat(init): resolver prompts + Zod schemas + stable cache-key hash

Five prompt templates (decision-v1, glossary-v1, agent-identity-v1,
weekly-summary-v1, conversation-summary-v1) share a SYSTEM_HEADER and
interpolate per-call context. Schemas validate the resolver outputs
before they reach the vault. cache-key.ts produces sha256(prompt-id
+ stable-stringified-context + model + temperature) so per-note
re-runs only fire when one of those inputs changes.
```

### Task 21: 30-decisions folder

**Files:**

- Create: `packages/init/src/emit/folders/decisions.ts`
- Create: `packages/init/test/emit/folders/decisions.test.ts`
- Create: `packages/init/test/fixtures/recordings/decisions-revert-chain.json`
- Modify: `packages/init/src/emit/index.ts`

The decisions folder clusters commits by author + 24h window + intent keywords, asks the resolver to identify which clusters represent decisions, and emits one note per surviving decision.

- [ ] **Step 1: Recorded fixture**

`packages/init/test/fixtures/recordings/decisions-revert-chain.json`:

```json
{
  "input": {
    "promptId": "decision-v1",
    "model": "zai-glm-4.7",
    "temperature": 0.3
  },
  "response": {
    "title": "Reverted feature introduction",
    "summary": "Initially introduced feature.ts with `export const x = 1`, tuned to `x = 2`, then reverted the original introduction.",
    "commits": ["abc1234"],
    "revertedShas": ["abc1234"]
  }
}
```

- [ ] **Step 2: Tests**

`packages/init/test/emit/folders/decisions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeDecisionSpecs } from "../../../src/emit/folders/decisions.js";
import type { RepoFacts } from "../../../src/types.js";

function mkCommit(sha: string, date: string, author: string, subject: string, parents: string[] = []) {
  return { sha, author, authorEmail: `${author}@x`, date, subject, body: "", parents, refs: [], filesChanged: [] };
}

describe("computeDecisionSpecs", () => {
  it("emits one resolver spec per cluster of commits within a 24h author window", () => {
    const facts = {
      repoRoot: "/x", identity: { name: "d", primaryLanguage: "TS", defaultBranch: "main" },
      topology: { currentBranch: "main", ahead: 0, behind: 0, dirtyFiles: [], upstream: null },
      commits: [
        mkCommit("a".repeat(40), "2026-01-01T10:00:00Z", "Alice", "feat: introduce feature"),
        mkCommit("b".repeat(40), "2026-01-01T15:00:00Z", "Alice", "feat: tune feature"),
        mkCommit("c".repeat(40), "2026-02-10T10:00:00Z", "Bob",   "feat: introduce v2"),
      ],
      files: [], manifests: [], planFiles: [], researchFiles: [], conversationFiles: [],
      agents: [], weeklyBuckets: [],
      scannedAt: "2026-05-14T11:00:00Z", headSha: "x",
    } satisfies RepoFacts;

    const specs = computeDecisionSpecs(facts);
    expect(specs.length).toBeGreaterThanOrEqual(2);
    for (const s of specs) {
      expect(s.pipeline).toBe("resolver");
      expect(s.outputPath.startsWith("30-decisions/")).toBe(true);
      expect(s.resolverInputs?.promptId).toBe("decision-v1");
      expect(s.resolverInputs?.schemaName).toBe("decision");
    }
  });

  it("attaches the cluster's commit shas to resolverInputs.context", () => {
    const facts = {
      repoRoot: "/x", identity: { name: "d", primaryLanguage: "TS", defaultBranch: "main" },
      topology: { currentBranch: "main", ahead: 0, behind: 0, dirtyFiles: [], upstream: null },
      commits: [
        mkCommit("a".repeat(40), "2026-01-01T10:00:00Z", "Alice", "feat: x"),
        mkCommit("b".repeat(40), "2026-01-01T20:00:00Z", "Alice", "feat: y"),
      ],
      files: [], manifests: [], planFiles: [], researchFiles: [], conversationFiles: [],
      agents: [], weeklyBuckets: [],
      scannedAt: "2026-05-14T11:00:00Z", headSha: "x",
    } satisfies RepoFacts;

    const [spec] = computeDecisionSpecs(facts);
    const shas = (spec!.resolverInputs!.context.commits as Array<{ sha: string }>).map((c) => c.sha);
    expect(shas).toContain("a".repeat(40));
    expect(shas).toContain("b".repeat(40));
  });
});
```

- [ ] **Step 3: Implementation**

`packages/init/src/emit/folders/decisions.ts`:

```ts
import type { CommitInfo, NoteSpec, RepoFacts } from "../../types.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface Cluster {
  author: string;
  start: string;
  end: string;
  commits: CommitInfo[];
}

function clusterCommits(commits: CommitInfo[]): Cluster[] {
  const sorted = [...commits].sort((a, b) => a.date.localeCompare(b.date));
  const out: Cluster[] = [];
  for (const c of sorted) {
    const last = out[out.length - 1];
    if (
      last &&
      last.author === c.author &&
      Date.parse(c.date) - Date.parse(last.end) <= ONE_DAY_MS
    ) {
      last.commits.push(c);
      last.end = c.date;
    } else {
      out.push({ author: c.author, start: c.date, end: c.date, commits: [c] });
    }
  }
  return out;
}

function slugify(parts: string[]): string {
  return parts
    .join("-")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
}

function isLikelyDecision(cluster: Cluster): boolean {
  // Cheap heuristic to reduce resolver calls: a cluster of >=1 commits whose
  // subjects mention introduce / remove / switch / migrate / revert / drop /
  // adopt / replace is decision-shaped. Other clusters are skipped.
  const keywords = /\b(introduc|remov|switch|migrat|revert|drop|adopt|replac)/i;
  return cluster.commits.some((c) => keywords.test(c.subject) || keywords.test(c.body));
}

export function computeDecisionSpecs(facts: RepoFacts): NoteSpec[] {
  const clusters = clusterCommits(facts.commits).filter(isLikelyDecision);
  return clusters.map((cluster) => {
    const date = cluster.start.slice(0, 10);
    const subjectSlug = slugify([cluster.author, cluster.commits[0]!.subject.split(":")[0] ?? ""]);
    return {
      outputPath: `30-decisions/${date}-${subjectSlug}.md`,
      pipeline: "resolver",
      source: "commit-cluster",
      resolverInputs: {
        promptId: "decision-v1",
        context: {
          commits: cluster.commits.map((c) => ({ sha: c.sha, subject: c.subject, body: c.body, date: c.date })),
          author: cluster.author,
          windowStart: cluster.start,
          windowEnd: cluster.end,
          revertedShas: cluster.commits.flatMap((c) => extractRevertedShas(c)),
        },
        schemaName: "decision",
      },
      wikilinks: [],
    };
  });
}

function extractRevertedShas(commit: CommitInfo): string[] {
  // Match "This reverts commit <sha>" in commit body (standard git revert format).
  const matches = [...commit.body.matchAll(/This reverts commit ([0-9a-f]{7,40})/g)];
  return matches.map((m) => m[1]!);
}
```

Register in `emit/index.ts`:

```ts
import { computeDecisionSpecs } from "./folders/decisions.js";
// ...
  allSpecs.push(...computeDecisionSpecs(facts));
```

- [ ] **Step 4: Stage + commit**

```bash
git add packages/init/src/emit/folders/decisions.ts \
        packages/init/test/emit/folders/decisions.test.ts \
        packages/init/test/fixtures/recordings/decisions-revert-chain.json \
        packages/init/src/emit/index.ts
```

```text
feat(init): 30-decisions emits resolver specs for commit clusters

Clusters commits by author + 24h window. Filters to decision-shaped
clusters via a keyword heuristic (introduce / remove / switch / migrate
/ revert / drop / adopt / replace) so the resolver does not get spammed
with routine commits.

Each cluster becomes one NoteSpec with pipeline: "resolver", promptId
"decision-v1", schemaName "decision". Context carries the cluster's
commit shas + subjects + bodies plus any explicit `This reverts commit
<sha>` mentions parsed from the bodies.

Recorded fixture for tests at fixtures/recordings/decisions-revert-chain.json.
```

### Task 22: 70-glossary folder

**Files:**

- Create: `packages/init/src/emit/folders/glossary.ts`
- Create: `packages/init/test/emit/folders/glossary.test.ts`
- Create: `packages/init/test/fixtures/recordings/glossary-agents.json`
- Modify: `packages/init/src/emit/index.ts`

Two-stage flow. First a deterministic candidate-term extractor pulls capitalized n-grams + repeated multi-word phrases out of commit messages + plan excerpts + conversation prompts. Then one resolver call per candidate term refines + dedupes.

- [ ] **Step 1: Recorded fixture**

`packages/init/test/fixtures/recordings/glossary-agents.json`:

```json
{
  "input": { "promptId": "glossary-v1", "model": "zai-glm-4.7", "temperature": 0.3 },
  "response": {
    "term": "asset-pipeline",
    "gloss": "The Pawfall background system that drains art proposals into the codex backlog.",
    "sources": ["commit feat: asset-pipeline init"]
  }
}
```

- [ ] **Step 2: Tests**

`packages/init/test/emit/folders/glossary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeGlossarySpecs } from "../../../src/emit/folders/glossary.js";
import type { RepoFacts } from "../../../src/types.js";

function mkCommit(subject: string, body = "") {
  return { sha: "a".repeat(40), author: "L", authorEmail: "l@x", date: "2026-05-14T10:00:00Z", subject, body, parents: [], refs: [], filesChanged: [] };
}

describe("computeGlossarySpecs", () => {
  it("emits one resolver spec per candidate term", () => {
    const facts = {
      repoRoot: "/x", identity: { name: "d", primaryLanguage: "TS", defaultBranch: "main" },
      topology: { currentBranch: "main", ahead: 0, behind: 0, dirtyFiles: [], upstream: null },
      commits: [
        mkCommit("feat(asset-pipeline): drain backlog"),
        mkCommit("feat(asset-pipeline): wire fog-of-war"),
        mkCommit("fix: wave-clear bug"),
      ],
      files: [], manifests: [], planFiles: [], researchFiles: [], conversationFiles: [],
      agents: [], weeklyBuckets: [],
      scannedAt: "2026-05-14T11:00:00Z", headSha: "x",
    } satisfies RepoFacts;

    const specs = computeGlossarySpecs(facts);
    expect(specs.length).toBeGreaterThan(0);
    expect(specs.every((s) => s.pipeline === "resolver")).toBe(true);
    expect(specs.every((s) => s.outputPath.startsWith("70-glossary/"))).toBe(true);
    expect(specs.every((s) => s.resolverInputs?.schemaName === "glossary-term")).toBe(true);
  });

  it("attaches source spans to each term's context", () => {
    const facts = {
      repoRoot: "/x", identity: { name: "d", primaryLanguage: "TS", defaultBranch: "main" },
      topology: { currentBranch: "main", ahead: 0, behind: 0, dirtyFiles: [], upstream: null },
      commits: [
        mkCommit("feat(asset-pipeline): drain backlog"),
        mkCommit("feat(asset-pipeline): wire fog-of-war"),
      ],
      files: [], manifests: [], planFiles: [], researchFiles: [], conversationFiles: [],
      agents: [], weeklyBuckets: [],
      scannedAt: "2026-05-14T11:00:00Z", headSha: "x",
    } satisfies RepoFacts;

    const specs = computeGlossarySpecs(facts);
    for (const s of specs) {
      const spans = s.resolverInputs!.context.spans as string[];
      expect(spans.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 3: Implementation**

`packages/init/src/emit/folders/glossary.ts`:

```ts
import type { NoteSpec, RepoFacts } from "../../types.js";

// Capture multi-word phrases inside parens: "feat(asset-pipeline): ..."
const SCOPE_RE = /\(([a-z][a-z0-9_-]{2,})\)/g;
// Capture hyphenated phrases anywhere in commit subjects / plan excerpts.
const HYPHENATED_RE = /\b([a-z]{3,}(?:-[a-z]{3,}){1,})\b/g;

function extractCandidates(facts: RepoFacts): Map<string, string[]> {
  const candidates = new Map<string, string[]>();
  const add = (term: string, span: string) => {
    const list = candidates.get(term) ?? [];
    list.push(span);
    candidates.set(term, list);
  };

  for (const c of facts.commits) {
    for (const m of c.subject.matchAll(SCOPE_RE)) add(m[1]!, `commit ${c.subject}`);
    for (const m of c.subject.matchAll(HYPHENATED_RE)) add(m[1]!, `commit ${c.subject}`);
    for (const m of c.body.matchAll(HYPHENATED_RE)) add(m[1]!, `commit ${c.subject} (body)`);
  }
  for (const p of facts.planFiles) {
    for (const m of p.excerpt.matchAll(HYPHENATED_RE)) add(m[1]!, `plan ${p.path}`);
  }
  for (const conv of facts.conversationFiles) {
    for (const m of conv.firstUserPrompt.matchAll(HYPHENATED_RE)) add(m[1]!, `conversation ${conv.path}`);
  }

  // Keep only terms that appear at least twice or are explicit scope mentions.
  for (const [term, spans] of [...candidates]) {
    if (spans.length < 2 && !spans.some((s) => s.includes("commit feat("))) {
      candidates.delete(term);
    }
  }
  return candidates;
}

function slugify(term: string): string {
  return term.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

export function computeGlossarySpecs(facts: RepoFacts): NoteSpec[] {
  const candidates = extractCandidates(facts);
  const specs: NoteSpec[] = [];
  for (const [term, spans] of candidates) {
    specs.push({
      outputPath: `70-glossary/${slugify(term)}.md`,
      pipeline: "resolver",
      source: "glossary-extract",
      resolverInputs: {
        promptId: "glossary-v1",
        context: { term, spans: spans.slice(0, 20) },
        schemaName: "glossary-term",
      },
      wikilinks: [],
    });
  }
  return specs;
}
```

Register in `emit/index.ts`:

```ts
import { computeGlossarySpecs } from "./folders/glossary.js";
// ...
  allSpecs.push(...computeGlossarySpecs(facts));
```

- [ ] **Step 4: Stage + commit**

```bash
git add packages/init/src/emit/folders/glossary.ts \
        packages/init/test/emit/folders/glossary.test.ts \
        packages/init/test/fixtures/recordings/glossary-agents.json \
        packages/init/src/emit/index.ts
```

```text
feat(init): 70-glossary extracts hyphenated terms + scope tags

Two regex sweeps: explicit scope tags inside parens (feat(asset-pipeline):)
and hyphenated phrases anywhere in commit subjects, bodies, plan
excerpts, and conversation prompts. Terms that occur at least twice
or appear as an explicit scope become candidate spans.

Each candidate produces one resolver spec with promptId "glossary-v1"
and schemaName "glossary-term". Context carries the spans (capped at 20
per term so prompts stay small).
```

### Task 23: Pipeline orchestrator + resolver fan-out

**Files:**

- Create: `packages/init/src/pipeline.ts`
- Create: `packages/init/src/write/index.ts`
- Create: `packages/init/test/pipeline.test.ts`
- Modify: `packages/init/src/index.ts` (re-export pipeline + types)

This task wires Stage 3 against the SD2 resolver. Writes never touch real disk in this test — uses an in-memory vault adapter. Real-disk integration is Task 32.

- [ ] **Step 1: Write the failing pipeline test**

`packages/init/test/pipeline.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createMockProvider, createProviderRegistry } from "@vibe/language";
import { extractFixtureRepo } from "./helpers/fixture-repo.js";
import { runPipeline } from "../src/pipeline.js";

let repoPath: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const fx = await extractFixtureRepo("agents");
  repoPath = fx.path;
  cleanup = fx.cleanup;
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

describe("runPipeline (in-memory vault)", () => {
  it("emits 00-state + 10-projects (deterministic) and skips resolver specs when noLlm", async () => {
    const result = await runPipeline({
      repoRoot: repoPath,
      vaultRoot: "/virtual/.vibe",
      noLlm: true,
      vault: { kind: "in-memory" },
    });

    expect(result.report.shape.totalSpecs).toBeGreaterThan(0);
    const paths = Object.keys(result.files);
    expect(paths.some((p) => p.endsWith("00-state/README.md"))).toBe(true);
    // Resolver-pipeline specs are NOT written when noLlm is set.
    expect(paths.some((p) => p.includes("30-decisions/"))).toBe(false);
  });

  it("calls the resolver per resolver-pipeline spec when a provider is registered", async () => {
    const provider = createMockProvider({
      id: "cerebras.glm_4_7",
      response: {
        title: "Sample decision",
        summary: "A sample resolved decision body.",
        commits: ["abc1234"],
        revertedShas: [],
      },
    });
    const registry = createProviderRegistry();
    registry.register(provider);

    const result = await runPipeline({
      repoRoot: repoPath,
      vaultRoot: "/virtual/.vibe",
      noLlm: false,
      registry,
      defaultResolver: { provider: "cerebras.glm_4_7", model: "zai-glm-4.7", temperature: 0.3 },
      vault: { kind: "in-memory" },
    });

    expect(provider.history.length).toBeGreaterThan(0);
    expect(Object.keys(result.files).some((p) => p.includes("30-decisions/"))).toBe(true);
  });
});
```

- [ ] **Step 2: Implementation**

`packages/init/src/write/index.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.js";
import { writeIfChanged } from "./diff.js";
import type { NoteFile } from "./frontmatter.js";

/**
 * Abstraction over the on-disk vault so unit tests can swap in an in-memory
 * Map and integration tests use the real filesystem.
 */
export interface VaultIo {
  read(relativePath: string): Promise<{ content: string; hadFile: boolean }>;
  write(relativePath: string, content: string): Promise<"wrote" | "unchanged">;
  list(): Promise<string[]>;
}

export function createDiskVault(vaultRoot: string): VaultIo {
  return {
    async read(rel) {
      try {
        const content = await readFile(join(vaultRoot, rel), "utf8");
        return { content, hadFile: true };
      } catch {
        return { content: "", hadFile: false };
      }
    },
    async write(rel, content) {
      return writeIfChanged(join(vaultRoot, rel), content);
    },
    async list() {
      // Phase G uses this for stale detection. Defer real implementation.
      return [];
    },
  };
}

export interface InMemoryVault extends VaultIo {
  files: Map<string, string>;
}

export function createInMemoryVault(): InMemoryVault {
  const files = new Map<string, string>();
  return {
    files,
    async read(rel) {
      const content = files.get(rel) ?? "";
      return { content, hadFile: files.has(rel) };
    },
    async write(rel, content) {
      const existing = files.get(rel);
      if (existing === content) return "unchanged";
      files.set(rel, content);
      return "wrote";
    },
    async list() {
      return [...files.keys()];
    },
  };
}

export async function readNoteFile(vault: VaultIo, rel: string): Promise<{ note: NoteFile; hadFile: boolean }> {
  const { content, hadFile } = await vault.read(rel);
  if (!hadFile) return { note: { frontmatter: null, body: "" }, hadFile: false };
  return { note: parseFrontmatter(content), hadFile: true };
}
```

`packages/init/src/pipeline.ts`:

```ts
import { resolveProse } from "@vibe/language";
import type { ProviderRegistry } from "@vibe/language";
import { scanRepo } from "./scan/index.js";
import { emitPlan } from "./emit/index.js";
import { getSchema } from "./emit/schemas.js";
import { buildPrompt } from "./emit/prompts.js";
import { computeNoteCacheKey } from "./emit/cache-key.js";
import { renderNote } from "./write/render-note.js";
import { decideAction } from "./write/refresh-rules.js";
import { createDiskVault, createInMemoryVault, readNoteFile, type InMemoryVault, type VaultIo } from "./write/index.js";
import type { NoteFrontmatter, NoteSpec } from "./types.js";
import type { NoteReport, RunReport } from "./report.js";

export interface PipelineInput {
  repoRoot: string;
  vaultRoot: string;
  noLlm?: boolean;
  onlyFolder?: string;
  registry?: ProviderRegistry;
  defaultResolver?: { provider: string; model: string; temperature: number };
  vault?: { kind: "disk" } | { kind: "in-memory" };
  command?: "init" | "sync";
}

export interface PipelineResult {
  report: RunReport;
  files: Record<string, string>;     // populated only for in-memory vaults
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const startedAt = new Date().toISOString();
  const vault: VaultIo = input.vault?.kind === "in-memory"
    ? createInMemoryVault()
    : createDiskVault(input.vaultRoot);

  const facts = await scanRepo(input.repoRoot);
  const specs = emitPlan(facts, { onlyFolder: input.onlyFolder });

  const notes: NoteReport[] = [];
  let written = 0;
  let skipped = 0;
  let cached = 0;
  let failed = 0;

  for (const spec of specs) {
    if (spec.pipeline === "resolver" && input.noLlm) {
      notes.push({ outputPath: spec.outputPath, status: "skipped", reason: "no-llm" });
      skipped += 1;
      continue;
    }

    const { note: existing, hadFile } = await readNoteFile(vault, spec.outputPath);
    let freshCacheKey: string | undefined;
    if (spec.pipeline === "resolver" && input.defaultResolver) {
      freshCacheKey = computeNoteCacheKey({
        promptId: spec.resolverInputs!.promptId,
        context: spec.resolverInputs!.context,
        model: input.defaultResolver.model,
        temperature: input.defaultResolver.temperature,
      });
    }

    const action = decideAction(spec, existing.frontmatter, hadFile, freshCacheKey);

    if (action.kind === "skip") {
      notes.push({ outputPath: spec.outputPath, status: "skipped", reason: action.reason });
      skipped += 1;
      continue;
    }
    if (action.kind === "cached") {
      notes.push({ outputPath: spec.outputPath, status: "cached", cacheKey: freshCacheKey });
      cached += 1;
      continue;
    }

    let fm: NoteFrontmatter;
    let body = spec.body ?? "";

    if (action.kind === "resolver-call") {
      if (!input.registry || !input.defaultResolver) {
        notes.push({ outputPath: spec.outputPath, status: "failed", error: "resolver-call without registry+defaultResolver" });
        failed += 1;
        continue;
      }
      try {
        const built = buildPrompt(spec.resolverInputs!.promptId as never, spec.resolverInputs!.context);
        const schema = getSchema(spec.resolverInputs!.schemaName as never);
        const result = await resolveProse({
          region: { kind: "prose", start: 0, end: 0, text: `${built.system}\n\n${built.user}` },
          context: input.defaultResolver,
          schema,
          registry: input.registry,
        });
        body = JSON.stringify(result.value, null, 2);
        fm = {
          provenance: "resolver",
          generated_at: new Date().toISOString(),
          source: spec.source,
          resolver: input.defaultResolver,
          cache_key: freshCacheKey ?? "",
          schema_version: 1,
        };
      } catch (err) {
        notes.push({ outputPath: spec.outputPath, status: "failed", error: (err as Error).message });
        failed += 1;
        continue;
      }
    } else {
      fm = {
        provenance: "deterministic",
        generated_at: new Date().toISOString(),
        source: spec.source,
        schema_version: 1,
      };
    }

    const rendered = renderNote({ ...spec, body }, fm);
    const result = await vault.write(spec.outputPath, rendered);
    if (result === "wrote") written += 1;
    notes.push({ outputPath: spec.outputPath, status: "wrote", cacheKey: freshCacheKey });
  }

  const finishedAt = new Date().toISOString();
  const report: RunReport = {
    startedAt,
    finishedAt,
    command: input.command ?? "init",
    repoRoot: input.repoRoot,
    vaultRoot: input.vaultRoot,
    shape: { totalSpecs: specs.length, written, skipped, cached, failed },
    notes,
  };

  const files: Record<string, string> = {};
  if ((vault as InMemoryVault).files) {
    for (const [k, v] of (vault as InMemoryVault).files) files[k] = v;
  }
  return { report, files };
}
```

Update `packages/init/src/index.ts`:

```ts
export const VIBE_INIT_VERSION = "0.0.0";
export type { RepoFacts, NoteSpec, NoteFrontmatter, NotePipeline } from "./types.js";
export { scanRepo } from "./scan/index.js";
export { emitPlan } from "./emit/index.js";
export { runPipeline } from "./pipeline.js";
export type { PipelineInput, PipelineResult } from "./pipeline.js";
```

- [ ] **Step 3: Tests pass; stage**

```bash
git add packages/init/src/pipeline.ts \
        packages/init/src/write/index.ts \
        packages/init/src/index.ts \
        packages/init/test/pipeline.test.ts
```

```text
feat(init): runPipeline orchestrates scan + emit + resolver + write

Wires scanRepo (Stage 1) + emitPlan (Stage 2) + the refresh-rules
decision tree + SD2's resolveProse against a swappable VaultIo
adapter. In-memory vault for unit tests, disk vault for real init.

Resolver fan-out is sequential at v0 (per-note cache lookup keeps
re-runs free). Phase H adds the --concurrency flag for parallelism.

Failures (unknown provider, schema validation, etc.) become NoteReport
{ status: "failed", error } entries; the run continues so other notes
can still land.
```

---

## Phase F — Stage 2 hybrid folders (Tasks 24-26)

Three folders mix deterministic stats (rendered up-front) with a single resolver call that fills in a paragraph or two. Implemented via two NoteSpec extensions:

- `bodyHeader?: string` — pre-rendered markdown prepended before the resolver output.
- `resolverInputs.formatterName?: string` — references a function in `emit/formatters.ts` that converts the validated schema output into markdown.

### Task 24: Hybrid infrastructure + 20-agents folder

**Files:**

- Modify: `packages/init/src/types.ts` (extend NoteSpec)
- Create: `packages/init/src/emit/formatters.ts`
- Create: `packages/init/src/emit/folders/agents.ts`
- Create: `packages/init/test/emit/folders/agents.test.ts`
- Create: `packages/init/test/fixtures/recordings/agent-identity-codex.json`
- Modify: `packages/init/src/pipeline.ts` (use bodyHeader + formatter when present)
- Modify: `packages/init/src/emit/index.ts`

- [ ] **Step 1: Extend NoteSpec**

Append in `packages/init/src/types.ts`:

```ts
// Extend NoteSpec - bodyHeader + formatterName let hybrid folders mix
// deterministic stats above the resolver output.
declare module "./types.js" {}
```

Find the existing NoteSpec interface and replace with:

```ts
export interface NoteSpec {
  outputPath: string;
  pipeline: NotePipeline;
  source: string;
  body?: string;
  bodyHeader?: string;
  resolverInputs?: {
    promptId: string;
    context: Record<string, unknown>;
    schemaName: string;
    formatterName?: string;
  };
  wikilinks: string[];
}
```

- [ ] **Step 2: Formatter registry**

`packages/init/src/emit/formatters.ts`:

```ts
import type {
  AgentIdentityShape,
  ConversationSummaryShape,
  DecisionShape,
  GlossaryTermShape,
  WeeklySummaryShape,
} from "./schemas.js";

export type FormatterName =
  | "decision"
  | "glossary-term"
  | "agent-identity"
  | "weekly-summary"
  | "conversation-summary";

const FORMATTERS: Record<FormatterName, (v: unknown) => string> = {
  decision: (v) => {
    const d = v as DecisionShape;
    return [
      `# ${d.title}`,
      "",
      d.summary,
      "",
      "## Commits",
      "",
      ...d.commits.map((sha) => `- \`${sha}\``),
      ...(d.revertedShas.length > 0
        ? ["", "## Reverted", "", ...d.revertedShas.map((s) => `- \`${s}\``)]
        : []),
      "",
    ].join("\n");
  },
  "glossary-term": (v) => {
    const g = v as GlossaryTermShape;
    return [
      `# ${g.term}`,
      "",
      g.gloss,
      "",
      ...(g.sources.length > 0 ? ["## Sources", "", ...g.sources.map((s) => `- ${s}`), ""] : []),
    ].join("\n");
  },
  "agent-identity": (v) => {
    const a = v as AgentIdentityShape;
    return [
      "## Identity",
      "",
      a.paragraph,
      "",
      ...(a.themes.length > 0 ? ["**Themes:** " + a.themes.join(", "), ""] : []),
    ].join("\n");
  },
  "weekly-summary": (v) => {
    const w = v as WeeklySummaryShape;
    return ["## What happened", "", w.paragraph, ""].join("\n");
  },
  "conversation-summary": (v) => {
    const c = v as ConversationSummaryShape;
    return [
      "## Summary",
      "",
      c.paragraph,
      "",
      ...(c.decisions.length > 0
        ? ["## Decisions extracted", "", ...c.decisions.map((d) => `- ${d}`), ""]
        : []),
    ].join("\n");
  },
};

export function format(name: FormatterName, value: unknown): string {
  const fn = FORMATTERS[name];
  if (!fn) throw new Error(`unknown formatter: ${String(name)}`);
  return fn(value);
}
```

- [ ] **Step 3: Update pipeline to use bodyHeader + formatter**

In `packages/init/src/pipeline.ts`, replace the body assembly for the `resolver-call` branch:

```ts
        const built = buildPrompt(spec.resolverInputs!.promptId as never, spec.resolverInputs!.context);
        const schema = getSchema(spec.resolverInputs!.schemaName as never);
        const result = await resolveProse({
          region: { kind: "prose", start: 0, end: 0, text: `${built.system}\n\n${built.user}` },
          context: input.defaultResolver,
          schema,
          registry: input.registry,
        });
        const formatterName = spec.resolverInputs!.formatterName as never;
        const rendered = formatterName
          ? (await import("./emit/formatters.js")).format(formatterName, result.value)
          : JSON.stringify(result.value, null, 2);
        body = spec.bodyHeader ? `${spec.bodyHeader}\n${rendered}` : rendered;
```

For the deterministic branch (action.kind === "write"), prepend bodyHeader if present:

```ts
      body = spec.bodyHeader ? `${spec.bodyHeader}\n${spec.body ?? ""}` : (spec.body ?? "");
```

- [ ] **Step 4: Agents fixture**

`packages/init/test/fixtures/recordings/agent-identity-codex.json`:

```json
{
  "input": { "promptId": "agent-identity-v1", "model": "zai-glm-4.7", "temperature": 0.3 },
  "response": {
    "paragraph": "Codex focuses on backend refactors and dependency upgrades, typically landing changes on codex/* branches with author 'Codex'.",
    "themes": ["dependency upgrades", "refactors"]
  }
}
```

- [ ] **Step 5: Agents folder**

`packages/init/src/emit/folders/agents.ts`:

```ts
import type { AgentInfo, NoteSpec, RepoFacts } from "../../types.js";

function renderAgentStats(agent: AgentInfo): string {
  const lines = [
    `# Agent: ${agent.id}`,
    "",
    `- **Commits:** ${agent.commits}`,
    `- **Branches:** ${agent.branches.length === 0 ? "(none active)" : agent.branches.map((b) => `\`${b}\``).join(", ")}`,
    `- **First seen:** ${agent.firstSeen || "(none)"}`,
    `- **Last seen:** ${agent.lastSeen || "(none)"}`,
    "",
  ];
  return lines.join("\n");
}

export function computeAgentsSpecs(facts: RepoFacts): NoteSpec[] {
  return facts.agents.map((agent) => {
    const subjects = facts.commits
      .filter((c) => c.author.toLowerCase() === agent.id)
      .map((c) => c.subject)
      .slice(0, 30);
    return {
      outputPath: `20-agents/${agent.id}.md`,
      pipeline: "resolver",
      source: "agent-branch",
      bodyHeader: renderAgentStats(agent),
      resolverInputs: {
        promptId: "agent-identity-v1",
        context: { agentId: agent.id, branches: agent.branches, commits: subjects },
        schemaName: "agent-identity",
        formatterName: "agent-identity",
      },
      wikilinks: [],
    };
  });
}
```

Register in `emit/index.ts`:

```ts
import { computeAgentsSpecs } from "./folders/agents.js";
// ...
  allSpecs.push(...computeAgentsSpecs(facts));
```

- [ ] **Step 6: Agents test**

`packages/init/test/emit/folders/agents.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeAgentsSpecs } from "../../../src/emit/folders/agents.js";
import type { RepoFacts } from "../../../src/types.js";

const facts = {
  repoRoot: "/x", identity: { name: "d", primaryLanguage: "TS", defaultBranch: "main" },
  topology: { currentBranch: "main", ahead: 0, behind: 0, dirtyFiles: [], upstream: null },
  commits: [
    { sha: "a".repeat(40), author: "Codex", authorEmail: "c@x", date: "2026-05-14T10:00:00Z", subject: "feat: refactor", body: "", parents: [], refs: [], filesChanged: [] },
    { sha: "b".repeat(40), author: "Codex", authorEmail: "c@x", date: "2026-05-13T10:00:00Z", subject: "chore: bump deps", body: "", parents: [], refs: [], filesChanged: [] },
  ],
  files: [], manifests: [], planFiles: [], researchFiles: [], conversationFiles: [],
  agents: [
    { id: "codex", branches: ["codex/feature-1"], commits: 2, firstSeen: "2026-05-13T10:00:00Z", lastSeen: "2026-05-14T10:00:00Z" },
  ],
  weeklyBuckets: [],
  scannedAt: "2026-05-14T11:00:00Z", headSha: "x",
} satisfies RepoFacts;

describe("computeAgentsSpecs", () => {
  it("emits one spec per agent with bodyHeader + resolverInputs", () => {
    const specs = computeAgentsSpecs(facts);
    expect(specs).toHaveLength(1);
    const s = specs[0]!;
    expect(s.outputPath).toBe("20-agents/codex.md");
    expect(s.pipeline).toBe("resolver");
    expect(s.bodyHeader).toContain("# Agent: codex");
    expect(s.bodyHeader).toContain("**Commits:** 2");
    expect(s.resolverInputs?.promptId).toBe("agent-identity-v1");
    expect(s.resolverInputs?.formatterName).toBe("agent-identity");
  });

  it("passes subject list (capped 30) to the resolver context", () => {
    const specs = computeAgentsSpecs(facts);
    const subjects = specs[0]!.resolverInputs!.context.commits as string[];
    expect(subjects).toContain("feat: refactor");
    expect(subjects).toContain("chore: bump deps");
    expect(subjects.length).toBeLessThanOrEqual(30);
  });
});
```

- [ ] **Step 7: Stage + commit**

```bash
git add packages/init/src/types.ts \
        packages/init/src/emit/formatters.ts \
        packages/init/src/emit/folders/agents.ts \
        packages/init/test/emit/folders/agents.test.ts \
        packages/init/test/fixtures/recordings/agent-identity-codex.json \
        packages/init/src/pipeline.ts \
        packages/init/src/emit/index.ts
```

```text
feat(init): hybrid bodyHeader infrastructure + 20-agents folder

NoteSpec gains optional bodyHeader (deterministic prefix) and
resolverInputs.formatterName (typed renderer for the parsed
resolver output). pipeline.ts composes them: bodyHeader first,
then format(formatterName, result.value).

20-agents emits one resolver spec per detected agent with the
deterministic stats (commit count, branches, first/last seen)
in bodyHeader and the resolver-produced identity paragraph
formatted by the "agent-identity" formatter.

emit/formatters.ts registers formatters for all five resolver
schemas (decision, glossary-term, agent-identity, weekly-summary,
conversation-summary) so Phase E folders also get nice rendering.
```

### Task 25: 50-timeline folder

**Files:**

- Create: `packages/init/src/emit/folders/timeline.ts`
- Create: `packages/init/test/emit/folders/timeline.test.ts`
- Create: `packages/init/test/fixtures/recordings/weekly-summary-agents.json`
- Modify: `packages/init/src/emit/index.ts`

- [ ] **Step 1: Recorded fixture**

`packages/init/test/fixtures/recordings/weekly-summary-agents.json`:

```json
{
  "input": { "promptId": "weekly-summary-v1", "model": "zai-glm-4.7", "temperature": 0.3 },
  "response": {
    "paragraph": "Five Claude-authored commits landed on claude/feature-1, focused on incremental feature work. No reverts."
  }
}
```

- [ ] **Step 2: Test**

`packages/init/test/emit/folders/timeline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeTimelineSpecs } from "../../../src/emit/folders/timeline.js";
import type { RepoFacts } from "../../../src/types.js";

const facts = {
  repoRoot: "/x", identity: { name: "d", primaryLanguage: "TS", defaultBranch: "main" },
  topology: { currentBranch: "main", ahead: 0, behind: 0, dirtyFiles: [], upstream: null },
  commits: [],
  files: [], manifests: [], planFiles: [], researchFiles: [], conversationFiles: [],
  agents: [],
  weeklyBuckets: [
    { isoWeek: "2026-W19", startDate: "2026-05-04", commitCount: 5, contributors: ["Claude", "Luther"], filesChanged: 0, subjects: ["feat: a", "fix: b"] },
    { isoWeek: "2026-W18", startDate: "2026-04-27", commitCount: 2, contributors: ["Codex"], filesChanged: 0, subjects: ["chore: bump"] },
  ],
  scannedAt: "2026-05-14T11:00:00Z", headSha: "x",
} satisfies RepoFacts;

describe("computeTimelineSpecs", () => {
  it("emits one spec per bucket", () => {
    const specs = computeTimelineSpecs(facts);
    expect(specs).toHaveLength(2);
    const paths = specs.map((s) => s.outputPath).sort();
    expect(paths).toEqual(["50-timeline/2026-W18.md", "50-timeline/2026-W19.md"]);
  });

  it("includes commit count + contributor list in bodyHeader", () => {
    const specs = computeTimelineSpecs(facts);
    const w19 = specs.find((s) => s.outputPath.endsWith("W19.md"))!;
    expect(w19.bodyHeader).toContain("**Commits:** 5");
    expect(w19.bodyHeader).toContain("Claude");
    expect(w19.bodyHeader).toContain("Luther");
  });

  it("wires the weekly-summary-v1 prompt + formatter", () => {
    const specs = computeTimelineSpecs(facts);
    for (const s of specs) {
      expect(s.resolverInputs?.promptId).toBe("weekly-summary-v1");
      expect(s.resolverInputs?.formatterName).toBe("weekly-summary");
      expect(s.pipeline).toBe("resolver");
    }
  });
});
```

- [ ] **Step 3: Implementation**

`packages/init/src/emit/folders/timeline.ts`:

```ts
import type { NoteSpec, RepoFacts, WeeklyBucket } from "../../types.js";

function renderHeader(b: WeeklyBucket): string {
  return [
    `# Week ${b.isoWeek}`,
    "",
    `- **Starts:** ${b.startDate}`,
    `- **Commits:** ${b.commitCount}`,
    `- **Contributors:** ${b.contributors.join(", ")}`,
    "",
  ].join("\n");
}

export function computeTimelineSpecs(facts: RepoFacts): NoteSpec[] {
  return facts.weeklyBuckets.map((b) => ({
    outputPath: `50-timeline/${b.isoWeek}.md`,
    pipeline: "resolver",
    source: "weekly-activity",
    bodyHeader: renderHeader(b),
    resolverInputs: {
      promptId: "weekly-summary-v1",
      context: {
        isoWeek: b.isoWeek,
        commitCount: b.commitCount,
        contributors: b.contributors,
        subjects: b.subjects,
      },
      schemaName: "weekly-summary",
      formatterName: "weekly-summary",
    },
    wikilinks: [],
  }));
}
```

Register:

```ts
import { computeTimelineSpecs } from "./folders/timeline.js";
// ...
  allSpecs.push(...computeTimelineSpecs(facts));
```

- [ ] **Step 4: Stage + commit**

```bash
git add packages/init/src/emit/folders/timeline.ts \
        packages/init/test/emit/folders/timeline.test.ts \
        packages/init/test/fixtures/recordings/weekly-summary-agents.json \
        packages/init/src/emit/index.ts
```

```text
feat(init): 50-timeline emits per-ISO-week hybrid notes

One note per weekly bucket. bodyHeader carries the deterministic
stats (start date, commit count, contributors); the resolver fills
in the one-paragraph "what happened" via the weekly-summary-v1
prompt.
```

### Task 26: 80-conversations folder

**Files:**

- Create: `packages/init/src/emit/folders/conversations.ts`
- Create: `packages/init/test/emit/folders/conversations.test.ts`
- Create: `packages/init/test/fixtures/recordings/conversation-summary.json`
- Modify: `packages/init/src/emit/index.ts`

80-conversations also copies the original `.vibe` file alongside its summary note. That copy happens at write time, not in the spec — the spec carries the source path in `resolverInputs.context.transcript`. We extend the NoteSpec writer to support a "sidecar" copy via a new optional `sidecar` field.

For now, Task 26 emits the resolver-spec note only. The sidecar copy ships in Phase H's CLI work (when we have a real `repoRoot` to read from).

- [ ] **Step 1: Recorded fixture**

`packages/init/test/fixtures/recordings/conversation-summary.json`:

```json
{
  "input": { "promptId": "conversation-summary-v1", "model": "zai-glm-4.7", "temperature": 0.3 },
  "response": {
    "paragraph": "User asked how to ship X; assistant proposed Y. Decision: proceed with Y.",
    "decisions": ["proceed with Y"]
  }
}
```

- [ ] **Step 2: Test**

`packages/init/test/emit/folders/conversations.test.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractFixtureRepo } from "../../helpers/fixture-repo.js";
import { computeConversationSpecs } from "../../../src/emit/folders/conversations.js";

let repoPath: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const fx = await extractFixtureRepo("tiny");
  repoPath = fx.path;
  cleanup = fx.cleanup;
  await mkdir(join(repoPath, "conversations"), { recursive: true });
  await writeFile(
    join(repoPath, "conversations/brainstorm.vibe"),
    "### user\nHow do we ship X?\n\n### assistant\nWith Y.\n",
  );
});

afterAll(async () => { if (cleanup) await cleanup(); });

describe("computeConversationSpecs", () => {
  it("emits one resolver spec per conversation .vibe file", async () => {
    const facts = {
      repoRoot: repoPath, identity: { name: "d", primaryLanguage: "TS", defaultBranch: "main" },
      topology: { currentBranch: "main", ahead: 0, behind: 0, dirtyFiles: [], upstream: null },
      commits: [], files: [], manifests: [], planFiles: [], researchFiles: [],
      conversationFiles: [
        { path: "conversations/brainstorm.vibe", turnCount: 2, firstUserPrompt: "How do we ship X?" },
      ],
      agents: [], weeklyBuckets: [],
      scannedAt: "2026-05-14T11:00:00Z", headSha: "x",
    };

    const specs = await computeConversationSpecs(facts);
    expect(specs).toHaveLength(1);
    const s = specs[0]!;
    expect(s.outputPath).toBe("80-conversations/brainstorm.md");
    expect(s.pipeline).toBe("resolver");
    expect(s.resolverInputs?.promptId).toBe("conversation-summary-v1");
    expect(s.resolverInputs?.context.transcript).toContain("How do we ship X?");
  });

  it("renders header with source path + turn count", async () => {
    const facts = {
      repoRoot: repoPath, identity: { name: "d", primaryLanguage: "TS", defaultBranch: "main" },
      topology: { currentBranch: "main", ahead: 0, behind: 0, dirtyFiles: [], upstream: null },
      commits: [], files: [], manifests: [], planFiles: [], researchFiles: [],
      conversationFiles: [
        { path: "conversations/brainstorm.vibe", turnCount: 2, firstUserPrompt: "How do we ship X?" },
      ],
      agents: [], weeklyBuckets: [],
      scannedAt: "2026-05-14T11:00:00Z", headSha: "x",
    };

    const specs = await computeConversationSpecs(facts);
    expect(specs[0]!.bodyHeader).toContain("conversations/brainstorm.vibe");
    expect(specs[0]!.bodyHeader).toContain("**Turns:** 2");
  });
});
```

- [ ] **Step 3: Implementation**

`packages/init/src/emit/folders/conversations.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ConversationFileInfo, NoteSpec, RepoFacts } from "../../types.js";

function slugify(path: string): string {
  return path.replace(/^.*\//, "").replace(/\.vibe$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function renderHeader(c: ConversationFileInfo): string {
  return [
    `# Conversation: ${slugify(c.path)}`,
    "",
    `- **Source:** [[${c.path}]]`,
    `- **Turns:** ${c.turnCount}`,
    `- **First user prompt:** ${c.firstUserPrompt}`,
    "",
  ].join("\n");
}

export async function computeConversationSpecs(facts: RepoFacts): Promise<NoteSpec[]> {
  const specs: NoteSpec[] = [];
  for (const conv of facts.conversationFiles) {
    let transcript = "";
    try {
      transcript = await readFile(join(facts.repoRoot, conv.path), "utf8");
    } catch {
      transcript = "";
    }
    specs.push({
      outputPath: `80-conversations/${slugify(conv.path)}.md`,
      pipeline: "resolver",
      source: "conversation-summary",
      bodyHeader: renderHeader(conv),
      resolverInputs: {
        promptId: "conversation-summary-v1",
        context: {
          path: conv.path,
          turnCount: conv.turnCount,
          firstUserPrompt: conv.firstUserPrompt,
          transcript,
        },
        schemaName: "conversation-summary",
        formatterName: "conversation-summary",
      },
      wikilinks: [],
    });
  }
  return specs;
}
```

`computeConversationSpecs` is async (reads the transcript). Update `emit/index.ts`:

```ts
import { computeConversationSpecs } from "./folders/conversations.js";
// ...
export async function emitPlan(facts: RepoFacts, opts: EmitOptions = {}): Promise<NoteSpec[]> {
  const allSpecs: NoteSpec[] = [];
  allSpecs.push(...computeStateSpecs(facts));
  allSpecs.push(...computeProjectsSpecs(facts));
  allSpecs.push(...computePlansSpecs(facts));
  allSpecs.push(...computeResearchSpecs(facts));
  allSpecs.push(...computeHotspotsSpecs(facts));
  allSpecs.push(...computeDecisionSpecs(facts));
  allSpecs.push(...computeGlossarySpecs(facts));
  allSpecs.push(...computeAgentsSpecs(facts));
  allSpecs.push(...computeTimelineSpecs(facts));
  allSpecs.push(...await computeConversationSpecs(facts));

  if (opts.onlyFolder) {
    const prefix = `${opts.onlyFolder}/`;
    return allSpecs.filter((s) => s.outputPath.startsWith(prefix));
  }
  return allSpecs;
}
```

Update `runPipeline` in `pipeline.ts` to await `emitPlan`. Also update any caller in tests.

- [ ] **Step 4: Stage + commit**

```bash
git add packages/init/src/emit/folders/conversations.ts \
        packages/init/test/emit/folders/conversations.test.ts \
        packages/init/test/fixtures/recordings/conversation-summary.json \
        packages/init/src/emit/index.ts \
        packages/init/src/pipeline.ts
```

```text
feat(init): 80-conversations hybrid notes with transcript context

One note per detected .vibe file in conversation shape. bodyHeader
shows source path + turn count + first user prompt; the resolver
gets the full transcript (capped at 8000 chars in the prompt) and
returns paragraph + extracted decisions.

emitPlan is now async so the conversation folder can read transcripts
during spec construction. runPipeline awaits accordingly.

Sidecar copy of the original .vibe file is deferred to Phase H -
needs the real CLI repoRoot.
```

---
