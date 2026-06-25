import type { ProviderAdapter } from "../types.js";
export interface ClaudeCliOptions {
    binary: string;
    /** Optional id override; defaults to anthropic.claude_code. */
    id?: string;
    /** Optional extra args. */
    args?: string[];
}
export declare function createClaudeCliProvider(opts: ClaudeCliOptions): ProviderAdapter;
//# sourceMappingURL=claude.d.ts.map