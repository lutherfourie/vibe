import type { ZodTypeAny, z } from "zod";
import type { ProseRegion } from "../dispatcher/types.js";
import type { ProviderRegistry } from "../providers/index.js";
import { computeCacheKey, createInMemoryCache } from "./cache.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompts.js";
import type { ResolverContext, ResolverResult } from "./types.js";
import { makeVariance } from "./variance.js";

export type { ResolverContext, ResolverResult, Variance, PrimitivesSummary } from "./types.js";
export { computeCacheKey, createInMemoryCache } from "./cache.js";
export { formatVariance, makeVariance } from "./variance.js";

export interface ResolveProseInput<TSchema extends ZodTypeAny> {
  region: ProseRegion;
  context: ResolverContext;
  schema: TSchema;
  registry: ProviderRegistry;
}

export async function resolveProse<TSchema extends ZodTypeAny>(
  input: ResolveProseInput<TSchema>,
): Promise<ResolverResult<z.infer<TSchema>>> {
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
    return { ...hit, cached: true } as ResolverResult<z.infer<TSchema>>;
  }

  const messages = [
    {
      role: "system" as const,
      content: buildSystemPrompt({
        primitives: context.primitives ?? { agents: [], personas: [], providers: [], routes: [] },
      }),
    },
    { role: "user" as const, content: buildUserPrompt({ prose: region.text, role: region.role }) },
  ];

  const response = await adapter.generateObject<unknown>({
    messages,
    schema: schema as unknown,
    temperature,
  });

  // Validate. If the provider returns garbage, the resolver surfaces a typed
  // ZodError rather than silently emitting bad data.
  const parsed = schema.parse(response.value);

  const variance = makeVariance({ provider: context.provider, model: context.model, temperature });
  const result: ResolverResult<z.infer<TSchema>> = {
    value: parsed,
    variance,
    cached: false,
    cacheKey,
  };
  cache.set(cacheKey, result as ResolverResult);
  return result;
}
