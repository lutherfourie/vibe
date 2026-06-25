import type { ProviderAdapter } from "../types.js";
export interface CodexCliOptions {
    binary: string;
    /** Optional id override; defaults to openai.codex. */
    id?: string;
    /** Optional extra args. */
    args?: string[];
}
export declare function createCodexCliProvider(opts: CodexCliOptions): ProviderAdapter;
//# sourceMappingURL=codex.d.ts.map