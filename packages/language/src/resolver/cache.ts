import { createHash } from "node:crypto";
import type { ContentAddressedCache, ResolverResult } from "./types.js";

export function computeCacheKey(content: string, model: string, temperature: number): string {
  const hash = createHash("sha256");
  hash.update("v1\n");           // versioned so we can break cache shape later
  hash.update(`${content}\n`);
  hash.update(`${model}\n`);
  hash.update(`${temperature}\n`);
  return hash.digest("hex");
}

export function createInMemoryCache(): ContentAddressedCache {
  const store = new Map<string, ResolverResult>();
  return {
    get: (key) => store.get(key),
    set: (key, value) => { store.set(key, value); },
    size: () => store.size,
  };
}
