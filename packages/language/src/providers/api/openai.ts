import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import type {
  GenerateObjectRequest,
  GenerateObjectResponse,
  ProviderAdapter,
} from "../types.js";

export const DEFAULT_OPENAI_MODEL = "gpt-5.5";
export const DEFAULT_OPENAI_PROVIDER_ID = "openai.gpt_5_5";

export interface OpenAIProviderOptions {
  apiKey: string;
  /** OpenAI API model slug. Defaults to the current GPT-5.5 slug. */
  model?: string;
  /** Optional id override; defaults to a Vibe-safe id derived from the model. */
  id?: string;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  textVerbosity?: "low" | "medium" | "high";
}

export function createOpenAIProvider(opts: OpenAIProviderOptions): ProviderAdapter {
  if (!opts.apiKey) {
    throw new Error("OpenAI adapter: api key is required (pass apiKey:'sk-...').");
  }

  const model = opts.model ?? DEFAULT_OPENAI_MODEL;
  const id = opts.id ?? toVibeProviderId(model);
  const client = createOpenAI({ apiKey: opts.apiKey });

  return {
    id,
    mode: "api",
    async generateObject<T>(req: GenerateObjectRequest): Promise<GenerateObjectResponse<T>> {
      const result = await generateObject({
        model: client.responses(model),
        messages: req.messages,
        output: "object",
        schema: req.schema as never,
        temperature: req.temperature,
        maxOutputTokens: req.maxOutputTokens,
        providerOptions: {
          openai: {
            reasoningEffort: opts.reasoningEffort ?? "medium",
            textVerbosity: opts.textVerbosity ?? "low",
          },
        },
      } as never);
      return {
        value: result.object as T,
        usage: {
          inputTokens: result.usage?.inputTokens,
          outputTokens: result.usage?.outputTokens,
        },
      };
    },
  };
}

function toVibeProviderId(model: string): string {
  const safeModel = model.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return safeModel ? `openai.${safeModel}` : DEFAULT_OPENAI_PROVIDER_ID;
}
