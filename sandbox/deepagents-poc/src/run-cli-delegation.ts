import "dotenv/config";
import { HumanMessage } from "@langchain/core/messages";
import { buildCliDelegationAgent } from "./cli-delegation.js";

async function main() {
  console.log("\n=== Vibe deepagents POC: CLI delegation (Codex + Claude) ===\n");
  console.log(
    `Orchestrator: ${process.env.CEREBRAS_MODEL ?? "zai-glm-4.6"} via ${
      process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai/v1"
    }`,
  );

  const agent = buildCliDelegationAgent();

  const userInstruction =
    "Review the action plan at /outputs/2026-05-15-action-plan.md by delegating to Codex CLI and Claude CLI as described in your system prompt. Produce the combined review at /outputs/action-plan-review.md.";

  console.log("\n--- streaming agent events ---\n");

  for await (const [namespace, chunk] of await agent.stream(
    { messages: [new HumanMessage(userInstruction)] },
    { streamMode: "updates", subgraphs: true },
  )) {
    const tag =
      namespace.length > 0 ? `[subagent:${namespace.join("|")}]` : "[main]";
    console.log(tag, summarizeChunk(chunk));
  }

  console.log("\n=== Done. Inspect outputs/action-plan-review.md ===\n");
}

function summarizeChunk(chunk: unknown): string {
  if (!chunk || typeof chunk !== "object") return String(chunk);
  return Object.keys(chunk).join(", ") || "<empty>";
}

main().catch((err) => {
  console.error("\nPOC failed:", err);
  process.exit(1);
});
