# Vibe v0 SD3 — `vibe init` analysis pipeline (design)

**Status:** Design v1 — approved through brainstorming.
**Date:** 2026-05-14
**Owner:** Luther
**Subsystem:** Vibe language (Phase 1, SD3 of the four sub-deliverables).
**Predecessors:** [SD1 language layer](2026-05-13-vibe-language-v0.md) (merged), [SD2 dispatcher + resolver](../plans/2026-05-14-vibe-v0-sd2-resolver.md) (merged).

---

## 1. Goal

Implement `vibe init <repo>` and `vibe sync <repo>` end-to-end against the GameSpree reference repo. The command produces a `<repo>/.vibe/` Obsidian-compatible vault that another developer can open in Obsidian and *understand the project from* — its sub-projects, in-flight branches, decisions, hotspots, active agents, plans, timeline, glossary, conversations, and research.

The vault is the canonical artifact. It mixes:

- **Deterministic notes** extracted from git topology, file inventory, and source-file detection. Regenerated on every `vibe sync`.
- **Resolver-generated notes** produced by SD2's LLM resolver. Default model Cerebras GLM (`zai-glm-4.7`). Re-runs only when the content hash + model + temperature combination has not been seen before.
- **Human notes** authored or promoted in the vault directly. Surveyed via frontmatter and preserved across `vibe sync` runs.

`vibe init` running cleanly against GameSpree is the architecture spec's §7.1 success criterion. SD3 lands the pipeline that makes that real.

---

## 2. Scope

**In:** all 10 numbered vault folders, deep. Both deterministic and resolver pipelines wired against real GameSpree data. `vibe init` and `vibe sync` subcommands plus a stubbed `vibe build`. Frontmatter-based refresh contract. Recorded-fixture LLM tests + one end-to-end snapshot test against GameSpree.

**Out (Section 8 details):** `vibe build` proper, VS Code extension wiring, Spineflow integration, codex/gemini CLI provider shims, long-lived provider lifecycles, live-LLM CI, multi-repo/cloud-hosted vaults, performance optimization, and most within-folder polish beyond "one canonical rule per folder".

---

## 3. CLI surface

### 3.1 Binary

New workspace package: `packages/cli`. Exports a `bin: { vibe: ./dist/cli.js }`. Built with `commander` 13.x.

### 3.2 Subcommands

```text
vibe init <repo>      Fresh emit. Refuses if <repo>/.vibe/ already exists.
vibe sync <repo>      Re-runs analysis against an existing vault, honors
                      human-tagged frontmatter.
vibe build <repo>     Stub at SD3. Prints "deferred to SD5" and exits 1.
```

### 3.3 Global flags

| Flag | Behavior |
|---|---|
| `--dry-run` | Print the `NoteSpec[]` plan and what would change. No writes, no LLM calls. |
| `--no-llm` | Skip every resolver-pipeline note. Deterministic-only run. Useful offline + in CI. |
| `--folder <name>` | Regenerate only one folder (e.g., `--folder 30-decisions`). Stage 1 + 3 still run, but Stage 2 emits specs for the named folder only. |
| `--force` | Allow `vibe init` to overwrite an existing `.vibe/`. Required to overwrite human-tagged notes during sync. |
| `--concurrency <n>` | Cap on parallel resolver calls in Stage 3. Default 4. |

### 3.4 Auth

`CEREBRAS_API_KEY` environment variable. v0 supports no other auth path. `vibe init` errors loudly when it would call the resolver and the key is missing — unless `--no-llm` is set.

### 3.5 Output location

`<repo>/.vibe/` in-tree, with a minimal `<repo>/.vibe/.obsidian/` subdirectory containing workspace config so the user can open the vault directly in Obsidian without extra setup. `<repo>/.vibe/.cache/` holds run state (RepoFacts cache, last-run.json report) and is gitignored by default — `vibe init` adds a `.gitignore` line for `.vibe/.cache/` to the target repo if not already present (asks via `--dry-run` first).

---

## 4. Vault refresh contract

Every machine-emitted note opens with YAML frontmatter:

```yaml
---
vibe:
  provenance: deterministic | resolver | human
  generated_at: 2026-05-14T07:42:00Z
  source: git-topology | file-inventory | commit-cluster | agent-branch
          | plan-detect | weekly-activity | hotspot-rank | glossary-extract
          | conversation-summary | research-detect
  resolver:                              # only if provenance == resolver
    provider: cerebras.glm_4_7
    model: zai-glm-4.7
    temperature: 0.3
  cache_key: sha256-hex                  # only if provenance == resolver
  schema_version: 1
  stale: true                            # optional, only on orphaned notes
  error: "..."                           # optional, only on failed resolver calls
---
```

### 4.1 `vibe sync` refresh rules

1. **Read existing frontmatter.** If `provenance: human`, leave the file untouched. Done.
2. **`provenance: deterministic`** — regenerate from the latest repo state. Overwrite if content changed; preserve mtime if it didn't.
3. **`provenance: resolver`** — recompute the resolver `cache_key` from the current inputs (per-note content hash + model + temperature). If unchanged → leave the file alone (variance preserved). If changed → re-run resolver, overwrite.
4. **Missing or malformed frontmatter** — treat as `human`. Don't touch. Safe default that protects user-authored notes.

### 4.2 Promotion / demotion

- **Promotion:** human edits a machine note's frontmatter from `provenance: resolver` (or `deterministic`) to `provenance: human`. Subsequent syncs skip it forever.
- **Demotion:** human sets `provenance: resolver` (or `deterministic`) and runs `vibe sync`. The pipeline regenerates the note.

### 4.3 Stale notes

When `vibe sync` finds a previously machine-emitted note whose source no longer exists (e.g., a deleted branch's agent note, a removed file's hotspot note), it does NOT delete the file. Instead it:

1. Adds `stale: true` to the frontmatter.
2. Prepends a markdown comment `<!-- vibe-stale: source removed at <timestamp> -->` to the body.

The user decides whether to delete or promote-to-human. Audit trail preserved.

---

## 5. Per-folder content rules

| Folder | Pipeline | Emitted files |
|---|---|---|
| `00-state` | deterministic | `README.md` — repo identity (name, primary lang, default branch), git topology (current branch, ahead/behind upstream, dirty files), last 5 commits. |
| `10-projects` | deterministic | One `<name>.md` per detected sub-project. A sub-project is any directory at depth ≥ 2 from the repo root that contains a `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `pom.xml`, or `README.md`. The root manifest is the parent project (covered in 00-state), not a sub-project. Each note: manifest path, primary language, top 3 contributors. |
| `20-agents` | hybrid | One `<agent-id>.md` per AI identity (branch prefixes `claude/*`, `codex/*`, `cursor/*`, `gemini/*`). Deterministic part: commit count, branch list, first-seen / last-seen dates. Resolver part: one-paragraph "what this agent works on". |
| `30-decisions` | resolver | One `<date>-<slug>.md` per inferred decision. Pipeline: cluster commits by author + 24h window, ask resolver to identify decision-shaped clusters (introductions, removals, reverts, switches). Each note records cluster shas, narrative, revert chain. |
| `40-plans` | deterministic | One `<name>.md` per detected plan file (heuristic: `**/plan*.md`, `**/PLAN.md`, `**/superpowers/plans/*.md`, `**/planning/**`). Each note: wikilink + first 200-char excerpt. Plans are NOT copied. |
| `50-timeline` | hybrid | One `YYYY-Www.md` per active week (52 max). Deterministic: commit count, files touched, contributor list. Resolver: one-paragraph "what happened this week". |
| `60-hotspots` | deterministic | `README.md` ranks the top 20 files by commit count with last-modified + primary author. Per-file notes only for the top 5 (`<filepath-slug>.md`). |
| `70-glossary` | resolver | One `<term>.md` per extracted domain term. Resolver consumes the union of commit messages, plan excerpts, and conversation transcripts. Returns deduped terms with one-line glosses. Each note: term, source spans, short definition. |
| `80-conversations` | hybrid | One `<source>.md` summary per detected `.vibe` conversation file (`detectShape() === "conversation"`). Deterministic: copy the original alongside as `<source>.source.vibe`, count turns. Resolver: paragraph summary + key decisions extracted. |
| `90-research` | deterministic | One `<name>.md` per detected research file (heuristic: `**/research/*.md`, `**/RESEARCH.md`, `**/superpowers/research/*.md`). Same shape as 40-plans: wikilink + 200-char excerpt. Deliberately no LLM summary at v0. |

**Wikilinks.** Every note links to related notes using Obsidian `[[wikilinks]]`. Specifically:

- Agents link to their decisions.
- Decisions link to plan files cited in commit messages.
- Glossary terms link to wherever they're cited (decisions, plans, conversations).
- Timeline weeks link to decisions made that week.
- Hotspot notes link to plans + decisions that touched the file.

Wikilinks are emitted at note-write time; broken wikilinks are tolerated (Obsidian renders them as placeholders pointing nowhere — useful for discovery).

---

## 6. Pipeline architecture

The SD3 orchestrator decomposes into three stages, each a pure-ish function producing typed output. Code lives in a new `packages/init` workspace package. The CLI in `packages/cli` is a thin shell that calls `runInit(repo, opts)` / `runSync(repo, opts)`.

```text
┌────────────────────┐    ┌──────────────────────┐    ┌────────────────────┐
│ Stage 1: scan      │ →  │ Stage 2: emit-plan   │ →  │ Stage 3: write     │
│ (RepoFacts)        │    │ (NoteSpec[])         │    │ (vault on disk)    │
└────────────────────┘    └──────────────────────┘    └────────────────────┘
```

### 6.1 Stage 1 — scan

Deterministic, fast, no LLM. Walks the repo via `simple-git` (already used by SD2 dispatcher tests transitively) + Node `fs`. Builds a `RepoFacts` record:

```ts
interface RepoFacts {
  repoRoot: string;
  identity: { name: string; primaryLanguage: string; defaultBranch: string };
  topology: { currentBranch: string; ahead: number; behind: number; dirtyFiles: string[] };
  commits: CommitInfo[];           // capped to last 5000
  files: FileInfo[];               // path + size + stat
  manifests: ManifestInfo[];       // detected sub-project manifests
  planFiles: PlanFileInfo[];
  researchFiles: ResearchFileInfo[];
  conversationFiles: ConversationFileInfo[];
  agents: AgentInfo[];             // claude/*, codex/* branch groupings
  weeklyBuckets: WeeklyBucket[];   // commits / files / contributors per week
}
```

Stage 1 caches its output to `<repo>/.vibe/.cache/repo-facts.json` keyed on `HEAD` SHA. `vibe sync` skips Stage 1 if HEAD hasn't moved.

### 6.2 Stage 2 — emit-plan

Per-folder rules. Takes `RepoFacts` + the existing vault state (frontmatter scan of `<repo>/.vibe/**/*.md`) and produces a `NoteSpec[]`:

```ts
interface NoteSpec {
  outputPath: string;              // "20-agents/codex.md"
  pipeline: "deterministic" | "resolver";
  source: string;                  // matches frontmatter `source` field
  body?: string;                   // already rendered for deterministic
  resolverInputs?: {
    promptId: string;              // template id (e.g. "agent-identity-v1")
    context: Record<string, unknown>;
    schema: ZodTypeAny;
  };
  frontmatter: {
    provenance: "deterministic" | "resolver";
    source: string;
    schemaVersion: number;
  };
  wikilinks: string[];             // outbound links to inject into the body
}
```

Each folder gets a `compute<Folder>Specs(facts, existingVault): NoteSpec[]` function. Adding a new folder later is a new function + one entry in the dispatch table.

### 6.3 Stage 3 — write

For each `NoteSpec`:

1. Load the existing file's frontmatter. Apply §4.1 refresh rules to decide write / skip / mark-stale.
2. If pipeline is `resolver` and the cache_key differs from the existing file's, fire `resolveProse` (from SD2's resolver) and validate against the per-folder Zod schema.
3. Render frontmatter + body. Inject wikilinks at the bottom under a `## See also` heading.
4. Diff against the on-disk file. Only write if bytes changed (preserves file mtimes for unchanged notes — Obsidian's "recently modified" view stays meaningful).

Stage 3 fans out resolver calls in parallel up to `--concurrency` (default 4). Cache hits cost zero so the limit only matters under real LLM load.

### 6.4 Failure model

- Each stage writes a structured report to `<repo>/.vibe/.cache/last-run.json` with per-note status (`written` | `skipped` | `cached` | `failed`).
- A failed `RepoFacts` scan aborts the whole run (no vault writes).
- A failed resolver call for one note logs the error in the run report and writes a stub note with `vibe: { provenance: resolver, stale: true, error: "..." }` so the vault stays internally consistent. The exit code is non-zero so CI can catch it.
- `--no-llm` short-circuits Stage 2 to skip resolver-pipeline `NoteSpec`s entirely.

---

## 7. Testing strategy

### 7.1 Unit layer

Per-stage Vitest 2.x suites under `packages/init/test/`. Stage 1 tests work against a fixture-controlled fake git repo (built in `beforeAll` via `simple-git` against a `tmp/` directory; teardown removes it). Stage 2 tests are pure data transforms — feed a `RepoFacts` literal, assert the resulting `NoteSpec[]`. Stage 3 tests use an in-memory vault abstraction (`Map<path, content>`) so unit tests never touch disk.

### 7.2 Fixture-repo layer

Three deterministic git fixtures under `packages/init/test/fixtures/repos/`, each committed as a `.tar.gz` (git doesn't nest, so the tarball is the storage form; tests extract to `tmp/`):

- `tiny.git/` — 3 commits, single branch, single file. Stage 1 smoke.
- `agents.git/` — 20 commits across `main`, `claude/foo`, `codex/bar`. Agent-branch detection smoke.
- `revert-chain.git/` — 8 commits including 2 explicit reverts. Decision-cluster smoke.

### 7.3 Resolver layer (recorded fixtures)

Every resolver-pipeline `NoteSpec` shape gets at least one recorded JSON fixture under `packages/init/test/fixtures/recordings/`, same pattern as SD2's `cerebras-hello.json`. Tests use SD2's `createMockProvider` to replay. Live Cerebras calls are gated behind `VIBE_INIT_LIVE_LLM=1` and run only manually.

### 7.4 Integration layer

One sealed integration test that runs `vibe init` (with `--no-llm`) against a snapshot of GameSpree at a pinned commit. Asserts vault structure (folders present, expected note counts, frontmatter shape) but NOT exact body content (too volatile against an evolving repo). Pinned commit lives in `packages/init/test/fixtures/gamespree-snapshot.sha` — refreshable as the reference repo evolves.

### 7.5 Refresh-semantics layer

Dedicated suite covering §4: `provenance: human` survives sync, `provenance: deterministic` regenerates, stale machine notes get marked but not deleted, malformed frontmatter is treated as human, promotion + demotion round-trip correctly.

### 7.6 Target counts

~80-100 new tests. SD1 has 160, SD2 added 68, so SD3 lands the suite around 310-330 total.

---

## 8. Out of scope

### 8.1 Cross-cutting deferrals

- `vibe build` — compiles `.vibe` sources to provider artifacts (AGENTS.md, .claude/, .codex/, .mcp.json). SD3 ships the CLI subcommand as a stub.
- VS Code extension wiring of init/sync (commands, tree view of `.vibe/`, hover-preview of resolver notes). SD4 owns this.
- Long-lived CLI provider lifecycles and codex/gemini provider shims. SD2 shipped short-lived + claude only; SD3 doesn't touch those.
- Spineflow integration. The vault IS the memory at this stage; Spineflow wiring is Phase 4.
- Multi-repo / cloud-hosted vault sync. v0 is purely local.

### 8.2 Within-folder deferrals

- `90-research` ships deterministic-only. LLM-summarized research notes defer.
- `80-conversations` only ingests `.vibe` conversation files. Free-form chat exports (Anthropic console transcripts as plain `.md`) defer to a future `vibe ingest` command.
- `30-decisions` clusters by author + 24h window + intent keywords only. No PR-thread following, no cross-branch decision merging.
- `60-hotspots` ranks by commit count only. Churn-weighted, author-diversity, and bus-factor metrics defer.
- `50-timeline` is weekly only. Daily / monthly / quarterly views defer.
- `70-glossary` extracts terms but does NOT cross-link to source-code occurrences.
- Per-note variance comparison (`vibe diff` across two `vibe sync` runs to surface model drift) defers.

### 8.3 Testing / operations deferrals

- Live-LLM tests in CI. CI never makes real network calls at v0. Live tests gate behind `VIBE_INIT_LIVE_LLM=1` and run manually.
- Performance work. No streaming output, no parallel-Stage-1 walks, no incremental rebuilds at sub-HEAD granularity. Profiling-driven optimization defers until SD3 demonstrably blocks real use.

---

## 9. Success criteria

SD3 is done when:

1. `vibe init c:/GameSpree` runs end-to-end and produces a `c:/GameSpree/.vibe/` Obsidian vault with all 10 numbered folders populated. Opens cleanly in Obsidian. A second developer can navigate it and understand the project's sub-projects, agents, decisions, plans, and hotspots without reading the source.
2. `vibe sync c:/GameSpree` correctly preserves human-tagged notes, regenerates deterministic notes, and only re-runs resolver calls when the input content has changed.
3. `vibe init` with `--no-llm` produces a deterministic-only vault that's structurally complete (every folder has at least its README; folders that would have been resolver-only show empty bodies with `provenance: resolver, skipped: true` frontmatter).
4. 310-330 tests passing. Both packages build clean. LSP boots and advertises capabilities (SD2 invariant preserved).
5. The GameSpree integration test passes against a pinned snapshot commit.
6. Final whole-SD3 code review returns `SD3_COMPLETE` or `SD3_COMPLETE_WITH_NOTES`.

---

## 10. Open questions deferred to plan

The implementation plan resolves these tactically; they don't need spec-level decisions:

- Exact `simple-git` API surface used (one-shot commands vs streaming).
- TypeScript type-share strategy between `@vibe/init` and `@vibe/language` (re-exports vs a shared `@vibe/types` package — lean toward re-exports to avoid a new package).
- Prompt template format (inline strings vs `.txt` template files vs typed builders) — depends on how many distinct prompts SD3 needs (estimated 4-6).
- Exact `wikilinks` rendering helper API (one function with options vs per-link-type functions).
- How `vibe init` discovers Obsidian config defaults — ship a minimal hand-written `.obsidian/` skeleton or detect the user's existing Obsidian setup.

---

*End of SD3 design v1. Implementation plan follows in `docs/superpowers/plans/2026-05-14-vibe-v0-sd3-init.md` via the writing-plans skill.*
