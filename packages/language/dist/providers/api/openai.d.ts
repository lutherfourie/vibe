import type { ProviderAdapter } from "../types.js";
export declare const DEFAULT_OPENAI_MODEL = "gpt-5.5";
export declare const DEFAULT_OPENAI_PROVIDER_ID = "openai.gpt_5_5";
export interface OpenAIProviderOptions {
    apiKey: string;
    /** OpenAI API model slug. Defaults to the current GPT-5.5 slug. */
    model?: string;
    /** Optional id override; defaults to a Vibe-safe id derived from the model. */
    id?: string;
    reasoningEffort?: "low" | "medium" | "high" | "xhigh";
    textVerbosity?: "low" | "medium" | "high";
}
export declare function createOpenAIProvider(opts: OpenAIProviderOptions): ProviderAdapter;
//# sourceMappingURL=openai.d.ts.map