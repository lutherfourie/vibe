import type { ProviderAdapter } from "../types.js";
export interface CliProviderOptions {
    id: string;
    binary: string;
    /** Extra args to prepend to every invocation. */
    args?: string[];
    /** Lifecycle policy. v0 ships short-lived only. */
    lifecycle?: "short-lived";
    /** Timeout per call in milliseconds. */
    timeoutMs?: number;
}
export declare function createCliProvider(opts: CliProviderOptions): ProviderAdapter;
//# sourceMappingURL=base.d.ts.map