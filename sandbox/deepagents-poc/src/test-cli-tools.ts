/**
 * Direct CLI-tool test — bypasses the deepagents orchestrator entirely.
 *
 * Validates that the wrapper functions can:
 * 1. Spawn the CLI subprocess
 * 2. Pass a substantial inline prompt
 * 3. Capture and return the CLI's text response
 *
 * If this script works but the orchestrator-driven lane fails, the variable
 * is the orchestrator's prompt construction, not the tools.
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { invokeCodexCli, invokeClaudeCli } from "./cli-tools.js";

async function main() {
  console.log("\n=== Direct CLI-tool test ===\n");

  const actionPlan = await readFile(
    "outputs/2026-05-15-action-plan.md",
    "utf8",
  );
  console.log(`Loaded action plan: ${actionPlan.length} chars\n`);

  const codexPrompt = `Below is a Pawfall action plan in markdown. Read it carefully, then list the TOP 3 items that should be implemented first, with one sentence of rationale per item. Output only the numbered list — no preamble, no markdown headers above the list.

---ACTION PLAN BEGIN---
${actionPlan}
---ACTION PLAN END---`;

  const claudePrompt = `Below is a Pawfall game action plan in markdown. Read it carefully, then identify the 3 BIGGEST risks, contradictions, or missing considerations. For each risk, give one sentence of rationale. Output only the numbered list — no preamble.

---ACTION PLAN BEGIN---
${actionPlan}
---ACTION PLAN END---`;

  console.log("--- Invoking Codex CLI ---");
  console.log(`Prompt size: ${codexPrompt.length} chars`);
  const t1 = Date.now();
  const codexResult = await invokeCodexCli.invoke({ prompt: codexPrompt });
  console.log(`Codex returned ${Date.now() - t1}ms, ${codexResult.length} chars`);
  console.log("\n--- Codex response ---\n");
  console.log(codexResult);

  console.log("\n--- Invoking Claude CLI ---");
  console.log(`Prompt size: ${claudePrompt.length} chars`);
  const t2 = Date.now();
  const claudeResult = await invokeClaudeCli.invoke({ prompt: claudePrompt });
  console.log(`Claude returned ${Date.now() - t2}ms, ${claudeResult.length} chars`);
  console.log("\n--- Claude response ---\n");
  console.log(claudeResult);

  console.log("\n=== Direct CLI test done ===\n");
}

main().catch((err) => {
  console.error("\nDirect test failed:", err);
  process.exit(1);
});
