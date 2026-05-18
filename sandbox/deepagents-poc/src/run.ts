import "dotenv/config";
import { HumanMessage } from "@langchain/core/messages";
import { buildFeedbackTriageAgent } from "./feedback-triage.js";

async function main() {
  console.log("\n=== Vibe deepagents POC: Pawfall feedback-triage ===\n");
  console.log(
    `Model: ${process.env.CEREBRAS_MODEL ?? "zai-glm-4.6"} via ${
      process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai/v1"
    }`,
  );

  const agent = buildFeedbackTriageAgent();

  const userInstruction =
    "Process the 2026-05-15 Pawfall feedback. Read /fixtures/pawfall/docs/feedback/2026-05-15.md and /fixtures/pawfall/docs/GDD.md, then write the action plan to /outputs/2026-05-15-action-plan.md.";

  console.log("\n--- streaming agent events ---\n");

  let lastChunk: unknown = null;
  for await (const [namespace, chunk] of await agent.stream(
    { messages: [new HumanMessage(userInstruction)] },
    { streamMode: "updates", subgraphs: true },
  )) {
    const tag = namespace.length > 0 ? `[subagent:${namespace.join("|")}]` : "[main]";
    console.log(tag, summarizeChunk(chunk));
    lastChunk = chunk;
  }

  console.log("\n=== Done. Inspect outputs/2026-05-15-action-plan.md ===\n");
  if (lastChunk) {
    // best-effort: show the final assistant message text if present
    try {
      const messages =
        (lastChunk as { messages?: { content?: unknown }[] }).messages ??
        Object.values(lastChunk as Record<string, { messages?: unknown[] }>)
          .flatMap((v) => v?.messages ?? []);
      const last = messages[messages.length - 1];
      const content = (last as { content?: unknown })?.content;
      if (typeof content === "string" && content.trim()) {
        console.log("--- final assistant message ---");
        console.log(content);
      }
    } catch {
      // ignore — streaming shape varies by deepagents version
    }
  }
}

function summarizeChunk(chunk: unknown): string {
  if (!chunk || typeof chunk !== "object") return String(chunk);
  const keys = Object.keys(chunk);
  return keys.length > 0 ? keys.join(", ") : "<empty>";
}

main().catch((err) => {
  console.error("\nPOC failed:", err);
  process.exit(1);
});
