import type { ProseRegion } from "../dispatcher/types.js";
export type { ProseRegion };

export interface Variance {
  /** Provider id used for this resolution (e.g. "openai.gpt_5_5"). */
  provider: string;
  /** Model id within the provider (e.g. "gpt-5.5"). */
  model: string;
  /** Sampling temperature used. */
  temperature: number;
  /** Timestamp the resolution was recorded (ISO 8601). */
  at: string;
}

export interface ResolverContext {
  /** Provider id to use for the LLM call. Looked up in the registry. */
  provider: string;
  /** Model id within the provider. */
  model: string;
  /** Sampling temperature; default 0.3. */
  temperature?: number;
  /** Optional cache instance — if absent, a fresh in-memory cache is used per call. */
  cache?: ContentAddressedCache;
  /** Optional declared-primitives summary the resolver hands to the LLM as context. */
  primitives?: PrimitivesSummary;
}

export interface PrimitivesSummary {
  agents: string[];
  personas: string[];
  providers: string[];
  routes: string[];
  /** ... add as the SD2 implementation needs them. */
}

export interface ResolverResult<T = unknown> {
  /** The parsed structured output. */
  value: T;
  /** Provenance metadata. */
  variance: Variance;
  /** Whether this result came from the cache (vs. a fresh provider call). */
  cached: boolean;
  /** The deterministic key used for cache lookup. */
  cacheKey: string;
}

export interface ContentAddressedCache {
  get(key: string): ResolverResult | undefined;
  set(key: string, value: ResolverResult): void;
  size(): number;
}
