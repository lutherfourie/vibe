import type { ProviderAdapter } from "./types.js";
export type { ProviderAdapter, ProviderMode, ChatMessage, ChatRole, GenerateObjectRequest, GenerateObjectResponse } from "./types.js";
export { createMockProvider } from "./mock.js";
export { createCodexCliProvider } from "./cli/codex.js";
export { createGrokProvider } from "./api/grok.js";
export { createBigAgiProvider } from "./api/big-agi.js";
export interface ProviderRegistry {
    register(adapter: ProviderAdapter): void;
    get(id: string): ProviderAdapter | undefined;
    ids(): string[];
}
export declare function createProviderRegistry(): ProviderRegistry;
//# sourceMappingURL=index.d.ts.map