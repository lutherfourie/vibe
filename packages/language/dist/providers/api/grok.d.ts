import type { ProviderAdapter } from "../types.js";
export interface GrokProviderOptions {
    apiKey: string;
    baseUrl?: string;
    model?: string;
    /** Optional id override; defaults to `grok.<model>`. */
    id?: string;
}
export declare const DEFAULT_GROK_MODEL = "grok-3";
export declare const DEFAULT_GROK_BASE_URL = "https://api.x.ai/v1";
export declare function createGrokProvider(opts: GrokProviderOptions): ProviderAdapter;
//# sourceMappingURL=grok.d.ts.map