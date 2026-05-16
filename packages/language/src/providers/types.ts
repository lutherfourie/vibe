export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface GenerateObjectRequest<TSchema = unknown> {
  messages: ChatMessage[];
  /** Zod schema (any zod type at runtime) used to validate / shape the output. */
  schema: TSchema;
  /** Sampling temperature; provider may clamp to its valid range. */
  temperature?: number;
  /** Maximum output tokens; provider may have its own ceiling. */
  maxOutputTokens?: number;
}

export interface GenerateObjectResponse<T = unknown> {
  /** The parsed value, already validated against the schema. */
  value: T;
  /** Raw token usage info from the provider, when available. */
  usage?: { inputTokens?: number; outputTokens?: number };
}

export type ProviderMode = "api" | "cli";

export interface ProviderAdapter {
  /** Provider id, e.g. "openai.gpt_5_5", "cerebras.glm_4_7", or "anthropic.claude_code". */
  id: string;
  /** Mode this adapter operates in. */
  mode: ProviderMode;
  /** Generate a typed object response. */
  generateObject<T>(req: GenerateObjectRequest): Promise<GenerateObjectResponse<T>>;
}
