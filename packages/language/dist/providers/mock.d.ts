import type { GenerateObjectRequest, ProviderAdapter } from "./types.js";
export interface MockProviderOptions {
    id?: string;
    mode?: "api" | "cli";
    /** Static response value returned for every call. */
    response: unknown;
}
export declare function createMockProvider(opts: MockProviderOptions): ProviderAdapter & {
    /** Captured request history for assertions in tests. */
    history: GenerateObjectRequest[];
};
//# sourceMappingURL=mock.d.ts.map