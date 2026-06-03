import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";
import type {
  GenerateObjectRequest,
  GenerateObjectResponse,
  ProviderAdapter,
} from "../types.js";

export interface GrokProviderOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  /** Optional id override; defaults to `grok.<model>`. */
  id?: string;
}

export const DEFAULT_GROK_MODEL = "grok-3";
export const DEFAULT_GROK_BASE_URL = "https://api.x.ai/v1";

export function createGrokProvider(opts: GrokProviderOptions): ProviderAdapter {
  if (!opts.apiKey) {
    throw new Error("Grok adapter: api key is required (pass apiKey:'xai-...').");
  }
  const model = opts.model ?? DEFAULT_GROK_MODEL;
  const baseUrl = opts.baseUrl ?? DEFAULT_GROK_BASE_URL;
  const id = opts.id ?? `grok.${model.replace(/[^A-Za-z0-9_]+/g, "_")}`;
  const client = createOpenAICompatible({
    name: "grok",
    apiKey: opts.apiKey,
    baseURL: baseUrl,
  });

  return {
    id,
    mode: "api",
    async generateObject<T>(req: GenerateObjectRequest): Promise<GenerateObjectResponse<T>> {
      const result = await generateObject({
        model: client(model),
        messages: req.messages,
        output: "object",
        schema: req.schema as never,
        temperature: req.temperature,
        maxOutputTokens: req.maxOutputTokens,
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
