import type { ZodTypeAny, z } from "zod";
import type { ProseRegion } from "../dispatcher/types.js";
import type { ProviderRegistry } from "../providers/index.js";
import type { ResolverContext, ResolverResult } from "./types.js";
export type { ResolverContext, ResolverResult, Variance, PrimitivesSummary } from "./types.js";
export { computeCacheKey, createInMemoryCache } from "./cache.js";
export { formatVariance, makeVariance } from "./variance.js";
export interface ResolveProseInput<TSchema extends ZodTypeAny> {
    region: ProseRegion;
    context: ResolverContext;
    schema: TSchema;
    registry: ProviderRegistry;
}
export declare function resolveProse<TSchema extends ZodTypeAny>(input: ResolveProseInput<TSchema>): Promise<ResolverResult<z.infer<TSchema>>>;
//# sourceMappingURL=index.d.ts.map