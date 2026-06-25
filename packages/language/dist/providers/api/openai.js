import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
export const DEFAULT_OPENAI_MODEL = "gpt-5.5";
export const DEFAULT_OPENAI_PROVIDER_ID = "openai.gpt_5_5";
export function createOpenAIProvider(opts) {
    if (!opts.apiKey) {
        throw new Error("OpenAI adapter: api key is required (pass apiKey:'sk-...').");
    }
    const model = opts.model ?? DEFAULT_OPENAI_MODEL;
    const id = opts.id ?? toVibeProviderId(model);
    const client = createOpenAI({ apiKey: opts.apiKey });
    return {
        id,
        mode: "api",
        async generateObject(req) {
            const result = await generateObject({
                model: client.responses(model),
                messages: req.messages,
                output: "object",
                schema: req.schema,
                temperature: req.temperature,
                maxOutputTokens: req.maxOutputTokens,
                providerOptions: {
                    openai: {
                        reasoningEffort: opts.reasoningEffort ?? "medium",
                        textVerbosity: opts.textVerbosity ?? "low",
                    },
                },
            });
            return {
                value: result.object,
                usage: {
                    inputTokens: result.usage?.inputTokens,
                    outputTokens: result.usage?.outputTokens,
                },
            };
        },
    };
}
function toVibeProviderId(model) {
    const safeModel = model.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    return safeModel ? `openai.${safeModel}` : DEFAULT_OPENAI_PROVIDER_ID;
}
//# sourceMappingURL=openai.js.map