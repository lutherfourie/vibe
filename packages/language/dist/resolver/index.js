import { computeCacheKey, createInMemoryCache } from "./cache.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompts.js";
import { makeVariance } from "./variance.js";
export { computeCacheKey, createInMemoryCache } from "./cache.js";
export { formatVariance, makeVariance } from "./variance.js";
export async function resolveProse(input) {
    const { region, context, schema, registry } = input;
    const adapter = registry.get(context.provider);
    if (!adapter) {
        throw new Error(`resolveProse: provider \`${context.provider}\` is not registered.`);
    }
    const temperature = context.temperature ?? 0.3;
    const cache = context.cache ?? createInMemoryCache();
    const cacheKey = computeCacheKey(region.text, context.model, temperature);
    const hit = cache.get(cacheKey);
    if (hit) {
        return { ...hit, cached: true };
    }
    const messages = [
        {
            role: "system",
            content: buildSystemPrompt({
                primitives: context.primitives ?? { agents: [], personas: [], providers: [], routes: [] },
            }),
        },
        { role: "user", content: buildUserPrompt({ prose: region.text, role: region.role }) },
    ];
    const response = await adapter.generateObject({
        messages,
        schema: schema,
        temperature,
    });
    // Validate. If the provider returns garbage, the resolver surfaces a typed
    // ZodError rather than silently emitting bad data.
    const parsed = schema.parse(response.value);
    const variance = makeVariance({ provider: context.provider, model: context.model, temperature });
    const result = {
        value: parsed,
        variance,
        cached: false,
        cacheKey,
    };
    cache.set(cacheKey, result);
    return result;
}
//# sourceMappingURL=index.js.map