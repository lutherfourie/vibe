export function mergeCorrected(input) {
    const { resolved, corrected } = input;
    if (!corrected) {
        return { value: resolved, overrides: [], unknownKeys: [] };
    }
    const value = { ...resolved };
    const overrides = [];
    const unknownKeys = [];
    for (const [key, override] of Object.entries(corrected)) {
        if (Object.prototype.hasOwnProperty.call(resolved, key)) {
            value[key] = override;
            overrides.push(key);
        }
        else {
            unknownKeys.push(key);
        }
    }
    return { value, overrides, unknownKeys };
}
//# sourceMappingURL=corrections.js.map