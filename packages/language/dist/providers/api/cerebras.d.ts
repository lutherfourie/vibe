import type { ProviderAdapter } from "../types.js";
export interface CerebrasProviderOptions {
    apiKey: string;
    baseUrl: string;
    model: string;
    /** Optional id override; defaults to `cerebras.<model>`. */
    id?: string;
}
export declare function createCerebrasProvider(opts: CerebrasProviderOptions): ProviderAdapter;
//# sourceMappingURL=cerebras.d.ts.map