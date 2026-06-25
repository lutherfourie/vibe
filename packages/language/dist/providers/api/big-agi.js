export function createBigAgiProvider(opts = {}) {
    const id = opts.id ?? "big-agi.beam";
    return {
        id,
        mode: opts.delegate?.mode ?? "api",
        async generateObject(req) {
            if (opts.delegate) {
                // Delegate for now; real impl would: fan N models in parallel (cerebras+openai+grok),
                // collect, then merge via another call or prompt into single object matching schema.
                return opts.delegate.generateObject(req);
            }
            throw new Error("big-AGI adapter: no delegate provided and full Beam multi-model orchestration not yet implemented. " +
                "See research note for intended fan-out/merge pattern in autonomous research/self-review steps. " +
                "Pass {delegate: createCerebrasProvider(...)} for interim single-model use.");
        },
    };
}
//# sourceMappingURL=big-agi.js.map