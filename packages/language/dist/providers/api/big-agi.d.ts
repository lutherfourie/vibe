import type { ProviderAdapter } from "../types.js";
/**
 * Placeholder adapter for big-AGI (enricoros/big-AGI) Beam multi-model orchestration.
 * Per research (docs/superpowers/research/2026-06-03-autonomous-long-horizon-survey.md):
 * we borrow the Beam (parallel models + merge) and personas concepts for autonomous
 * Research/Verify/SelfReview steps, but keep Vibe headless/git-grounded (no UI/storage).
 *
 * For v0 this delegates to a provided inner adapter or throws until full Beam client
 * (multi parallel generate + merge prompt) is wired. Use for fan-out in autonomous loop.
 */
export interface BigAgiProviderOptions {
    id?: string;
    /** Inner adapter to delegate single calls to (until beam impl). */
    delegate?: ProviderAdapter;
}
export declare function createBigAgiProvider(opts?: BigAgiProviderOptions): ProviderAdapter;
//# sourceMappingURL=big-agi.d.ts.map