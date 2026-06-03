import type {
  GenerateObjectRequest,
  GenerateObjectResponse,
  ProviderAdapter,
} from "../types.js";

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

export function createBigAgiProvider(opts: BigAgiProviderOptions = {}): ProviderAdapter {
  const id = opts.id ?? "big-agi.beam";
  return {
    id,
    mode: opts.delegate?.mode ?? "api",
    async generateObject<T>(req: GenerateObjectRequest): Promise<GenerateObjectResponse<T>> {
      if (opts.delegate) {
        // Delegate for now; real impl would: fan N models in parallel (cerebras+openai+grok),
        // collect, then merge via another call or prompt into single object matching schema.
        return opts.delegate.generateObject<T>(req);
      }
      throw new Error(
        "big-AGI adapter: no delegate provided and full Beam multi-model orchestration not yet implemented. " +
          "See research note for intended fan-out/merge pattern in autonomous research/self-review steps. " +
          "Pass {delegate: createCerebrasProvider(...)} for interim single-model use."
      );
    },
  };
}
