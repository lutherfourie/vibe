import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";
export function createCerebrasProvider(opts) {
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
        async generateObject(req) {
            const result = await generateObject({
                model: client(opts.model),
                messages: req.messages,
                // The Vercel AI SDK 6 generateObject signature accepts a Zod schema or
                // a JSON schema. The Resolver passes Zod; we pass it through unchanged.
                // We pin output: "object" explicitly so the SDK does not infer "enum"
                // when the schema's inferred type is `never`.
                output: "object",
                schema: req.schema,
                temperature: req.temperature,
                maxOutputTokens: req.maxOutputTokens,
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
//# sourceMappingURL=cerebras.js.map