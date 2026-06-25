export interface MergeCorrectedInput<T extends object> {
    resolved: T;
    corrected: Partial<T> | undefined;
}
export interface MergedResult<T extends object> {
    value: T;
    /** Keys that came from `corrected` and were applied. */
    overrides: string[];
    /** Keys in `corrected` that were NOT present on `resolved` and got dropped. */
    unknownKeys: string[];
}
export declare function mergeCorrected<T extends object>(input: MergeCorrectedInput<T>): MergedResult<T>;
//# sourceMappingURL=corrections.d.ts.map