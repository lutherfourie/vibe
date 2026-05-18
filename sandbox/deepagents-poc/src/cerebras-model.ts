import { ChatOpenAI } from "@langchain/openai";

/**
 * Create a LangChain ChatOpenAI instance pointed at Cerebras.
 *
 * Cerebras exposes an OpenAI-compatible endpoint, so the OpenAI adapter
 * works as long as we override the base URL and provide the Cerebras key.
 */
export function createCerebrasModel() {
  const apiKey = process.env.CEREBRAS_API_KEY;
  const baseURL =
    process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai/v1";
  const modelName = process.env.CEREBRAS_MODEL ?? "zai-glm-4.6";

  if (!apiKey) {
    throw new Error(
      "CEREBRAS_API_KEY missing — copy .env.example to .env and fill it in.",
    );
  }

  return new ChatOpenAI({
    model: modelName,
    apiKey,
    configuration: { baseURL },
    temperature: 0.3,
  });
}
