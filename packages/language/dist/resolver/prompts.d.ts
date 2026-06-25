import type { PrimitivesSummary } from "./types.js";
export interface SystemPromptInput {
    primitives: PrimitivesSummary;
}
export declare function buildSystemPrompt(input: SystemPromptInput): string;
export interface UserPromptInput {
    prose: string;
    role?: "user" | "assistant" | "system";
}
export declare function buildUserPrompt(input: UserPromptInput): string;
//# sourceMappingURL=prompts.d.ts.map