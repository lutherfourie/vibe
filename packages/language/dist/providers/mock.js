export function createMockProvider(opts) {
    const history = [];
    return {
        id: opts.id ?? "mock.fixture",
        mode: opts.mode ?? "api",
        history,
        async generateObject(req) {
            history.push(req);
            return { value: opts.response };
        },
    };
}
//# sourceMappingURL=mock.js.map