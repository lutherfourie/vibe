import "dotenv/config";
import { HumanMessage } from "@langchain/core/messages";
import { buildTruthsExtractionAgent } from "./truths-extraction.js";

async function main() {
  console.log("\n=== Vibe deepagents POC: Pawfall truths-extraction ===\n");
  console.log(
    `Model: ${process.env.CEREBRAS_MODEL ?? "zai-glm-4.6"} via ${
      process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai/v1"
    }`,
  );

  const agent = buildTruthsExtractionAgent();

  const userInstruction =
    "Extract the binding truths from /fixtures/pawfall/docs/GDD.md and write them to /outputs/pawfall-binding-truths.md.";

  console.log("\n--- streaming agent events ---\n");

  for await (const [namespace, chunk] of await agent.stream(
    { messages: [new HumanMessage(userInstruction)] },
    { streamMode: "updates", subgraphs: true },
  )) {
    const tag = namespace.length > 0 ? `[subagent:${namespace.join("|")}]` : "[main]";
    console.log(tag, summarizeChunk(chunk));
  }

  console.log("\n=== Done. Inspect outputs/pawfall-binding-truths.md ===\n");
}

function summarizeChunk(chunk: unknown): string {
  if (!chunk || typeof chunk !== "object") return String(chunk);
  return Object.keys(chunk).join(", ") || "<empty>";
}

main().catch((err) => {
  console.error("\nPOC failed:", err);
  process.exit(1);
});
