import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { readVibeSelfPlan } from "./read-vibe-self.mjs";

const sourcePath = resolve("examples/vibe-self.vibe");

test("reads examples/vibe-self.vibe into a standalone self-plan", async () => {
  const source = await readFile(sourcePath, "utf8");
  const plan = readVibeSelfPlan(source, { source: "examples/vibe-self.vibe" });

  assert.equal(plan.name, "vibe-self");
  assert.equal(plan.repo, "C:/vibe");
  assert.deepEqual(plan.routes, {
    resolver: "openai.gpt_5_5",
    researcher: "openai.gpt_5_5",
    implementation: "openai.codex",
  });
  assert.equal(plan.fallback, "openai.gpt_5_5");
  assert.deepEqual(plan.surfaces.map((surface) => surface.name), [
    "codex.local",
    "codex.cli",
    "codex.cloud",
    "codex.github_pr",
    "vscode.agent_admin",
    "crewai.local",
  ]);
  assert.deepEqual(plan.lanes.map((lane) => lane.name), [
    "research_lane",
    "language_lane",
    "runtime_spike_lane",
    "execution_surface_lane",
    "bootstrap_tooling_lane",
    "local_toolkit_lane",
    "vscode_agent_lane",
    "crewai_adapter_lane",
  ]);

  const localToolkit = plan.nextWorkChecklist.find(
    (item) => item.lane === "local_toolkit_lane",
  );
  assert.deepEqual(localToolkit, {
    lane: "local_toolkit_lane",
    target: "surface.codex.local",
    reads: [
      "README.md",
      "docs/fresh-start.md",
      "examples/vibe-self.vibe",
    ],
    owns: "docs/local-toolkit.md go/** packages/**",
    verify: [
      "pnpm run self:plan",
      "pnpm test",
      "pnpm run build",
    ],
    approval: "human.before_commit",
    checklist: [
      "Read README.md, docs/fresh-start.md, examples/vibe-self.vibe.",
      "Own docs/local-toolkit.md go/** packages/**.",
      "Emit small vibe CLI plan for doctor, lanes, handoff, verify, and memory.",
      "Verify with pnpm run self:plan; pnpm test; pnpm run build.",
      "Pause for human.before_commit.",
    ],
  });
});

test("CLI emits machine-readable JSON from the default source", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/read-vibe-self.mjs"],
    { cwd: resolve("."), encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.source, "examples/vibe-self.vibe");
  assert.equal(plan.nextWorkChecklist.length, 8);
  assert.equal(plan.gates[0].name, "human_merge_gate");
});
