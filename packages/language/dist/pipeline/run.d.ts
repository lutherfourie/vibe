import type { ZodTypeAny } from "zod";
import { dispatchSource } from "../dispatcher/index.js";
import type { ResolverResult } from "../resolver/types.js";
import type { ProviderRegistry } from "../providers/index.js";
export interface PipelineInput {
    source: string;
    registry: ProviderRegistry;
    defaultResolver: {
        provider: string;
        model: string;
        temperature: number;
    };
    /** Schema used to shape every prose-region resolution. */
    proseSchema?: ZodTypeAny;
}
export interface MergedRegion {
    value: unknown;
    overrides: string[];
    unknownKeys: string[];
    cacheKey: string;
}
export interface PipelineResult {
    shape: ReturnType<typeof dispatchSource>["shape"];
    parseErrors: string[];
    /** Every prose region the resolver produced output for, in source order. */
    resolvedRegions: ResolverResult[];
    /**
     * Resolver outputs that received human overrides via an adjacent
     * `corrected for "<tag>"` block. Only tagged prose regions (i.e. ones
     * authored with a ```vibe-prose#tag fence) whose tag matches a `corrected`
     * declaration appear here. Untagged prose resolutions are present in
     * `resolvedRegions` but never in `mergedRegions`.
     */
    mergedRegions: MergedRegion[];
    diagnostics: string[];
}
export declare function runPipeline(input: PipelineInput): Promise<PipelineResult>;
//# sourceMappingURL=run.d.ts.map