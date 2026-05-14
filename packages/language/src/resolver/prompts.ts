import type { PrimitivesSummary } from "./types.js";

export interface SystemPromptInput {
  primitives: PrimitivesSummary;
}

export function buildSystemPrompt(input: SystemPromptInput): string {
  const lines: string[] = [];
  lines.push("You are the Vibe LLM resolver.");
  lines.push("");
  lines.push("Vibe is a hybrid specification language. Structured regions of a .vibe");
  lines.push("source are parsed deterministically; prose regions go through you, the");
  lines.push("resolver, to produce typed structured output.");
  lines.push("");
  lines.push("Constraints:");
  lines.push("- You must produce output that conforms to the provided JSON schema.");
  lines.push("- You must not invent identifiers that are not in the declared primitives below.");
  lines.push("- When uncertain, prefer omitting an optional field over guessing.");
  lines.push("");
  lines.push("Declared primitives in this project:");
  const { agents, personas, providers, routes } = input.primitives;
  lines.push(`- agents: ${formatList(agents)}`);
  lines.push(`- personas: ${formatList(personas)}`);
  lines.push(`- providers: ${formatList(providers)}`);
  lines.push(`- routes: ${formatList(routes)}`);
  return lines.join("\n");
}

function formatList(items: string[]): string {
  if (items.length === 0) return "(none declared)";
  return items.join(", ");
}

export interface UserPromptInput {
  prose: string;
  role?: "user" | "assistant" | "system";
}

export function buildUserPrompt(input: UserPromptInput): string {
  const role = input.role ? `role: ${input.role}\n\n` : "";
  return `${role}<prose>\n${input.prose}\n</prose>`;
}
