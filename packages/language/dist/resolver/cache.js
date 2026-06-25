import { createHash } from "node:crypto";
export function computeCacheKey(content, model, temperature) {
    const hash = createHash("sha256");
    hash.update("v1\n"); // versioned so we can break cache shape later
    hash.update(`${content}\n`);
    hash.update(`${model}\n`);
    hash.update(`${temperature}\n`);
    return hash.digest("hex");
}
export function createInMemoryCache() {
    const store = new Map();
    return {
        get: (key) => store.get(key),
        set: (key, value) => { store.set(key, value); },
        size: () => store.size,
    };
}
//# sourceMappingURL=cache.js.map