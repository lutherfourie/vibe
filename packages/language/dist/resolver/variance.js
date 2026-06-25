export function makeVariance(input) {
    return {
        provider: input.provider,
        model: input.model,
        temperature: input.temperature,
        at: input.at ?? new Date().toISOString(),
    };
}
export function formatVariance(v) {
    return `resolver: ${v.provider}, model: ${v.model}, t: ${v.temperature}, at: ${v.at}`;
}
//# sourceMappingURL=variance.js.map