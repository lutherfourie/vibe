export { createMockProvider } from "./mock.js";
export { createCodexCliProvider } from "./cli/codex.js";
export { createGrokProvider } from "./api/grok.js";
export { createBigAgiProvider } from "./api/big-agi.js";
export function createProviderRegistry() {
    const map = new Map();
    return {
        register(adapter) {
            if (map.has(adapter.id)) {
                throw new Error(`Provider \`${adapter.id}\` is already registered.`);
            }
            map.set(adapter.id, adapter);
        },
        get(id) {
            return map.get(id);
        },
        ids() {
            return [...map.keys()];
        },
    };
}
//# sourceMappingURL=index.js.map