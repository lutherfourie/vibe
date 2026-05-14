import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";
import type {
  GenerateObjectRequest,
  GenerateObjectResponse,
  ProviderAdapter,
} from "../types.js";

export interface CerebrasProviderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Optional id override; defaults to `cerebras.<model>`. */
  id?: string;
}

export function createCerebrasProvider(opts: CerebrasProviderOptions): ProviderAdapter {
  if (!opts.apiKey) {
    throw new Error("Cerebras adapter: api key is required (pass apiKey:'sk-...').");
  }
  const id = opts.id ?? `cerebras.${opts.model}`;
  const client = createOpenAICompatible({
    name: "cerebras",
    apiKey: opts.apiKey,
    baseURL: opts.baseUrl,
  });

  return {
    id,
    mode: "api",
    async generateObject<T>(req: GenerateObjectRequest): Promise<GenerateObjectResponse<T>> {
      const result = await generateObject({
        model: client(opts.model),
        messages: req.messages,
        // The Vercel AI SDK 6 generateObject signature accepts a Zod schema or
        // a JSON schema. The Resolver passes Zod; we pass it through unchanged.
        // We pin output: "object" explicitly so the SDK does not infer "enum"
        // when the schema's inferred type is `never`.
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
