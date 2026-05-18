import "dotenv/config";
import path from "node:path";
import { HumanMessage } from "@langchain/core/messages";
import { loadAndTranslateLane } from "./translator.js";

async function main() {
  const laneName = process.argv[2];
  const userMessageOverride = process.argv.slice(3).join(" ") || undefined;

  if (!laneName) {
    console.error("Usage: tsx src/run-translated.ts <lane-name> [user message override]");
    console.error("Example: tsx src/run-translated.ts feedback-triage");
    process.exit(1);
  }

  const jsonPath = path.join(process.cwd(), "lanes", `${laneName}.json`);

  console.log(`\n=== Vibe translator: ${laneName} ===\n`);
  console.log(`Loading spec: ${path.relative(process.cwd(), jsonPath)}`);

  const { spec, agent } = await loadAndTranslateLane(jsonPath);

  console.log(`Lane: ${spec.name}`);
  console.log(`Description: ${spec.description ?? "(none)"}`);
  console.log(`Reads: ${(spec.reads ?? []).length} pattern(s)`);
  console.log(`Owns:  ${(spec.owns ?? []).length} pattern(s)`);
  console.log(`Tools: ${(spec.tools ?? []).join(", ") || "(built-in only)"}`);
  console.log(`Target surface (hint): ${spec.target ?? "(unspecified)"}`);
  console.log(`Approval gate (declared): ${spec.approval ?? "(none)"}`);

  const userMessage =
    userMessageOverride ??
    spec.defaultUserMessage ??
    `Run the ${spec.name} lane.`;

  console.log(`\nUser message:\n  ${userMessage}\n`);
  console.log("--- streaming agent events ---\n");

  for await (const [namespace, chunk] of await agent.stream(
    { messages: [new HumanMessage(userMessage)] },
    { streamMode: "updates", subgraphs: true },
  )) {
    const tag =
      namespace.length > 0 ? `[sub:${namespace.join("|")}]` : "[main]";
    console.log(tag, summarizeChunk(chunk));
  }

  console.log(`\n=== Done: ${spec.name} ===\n`);
}

function summarizeChunk(chunk: unknown): string {
  if (!chunk || typeof chunk !== "object") return String(chunk);
  return Object.keys(chunk).join(", ") || "<empty>";
}

main().catch((err) => {
  console.error("\nTranslator run failed:", err);
  process.exit(1);
});
