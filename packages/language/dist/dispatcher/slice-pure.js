export function slicePureStructured(source) {
    if (source.length === 0)
        return [];
    return [
        {
            kind: "structured",
            start: 0,
            end: source.length,
            text: source,
        },
    ];
}
//# sourceMappingURL=slice-pure.js.map