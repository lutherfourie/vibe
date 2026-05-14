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

export function mergeCorrected<T extends object>(input: MergeCorrectedInput<T>): MergedResult<T> {
  const { resolved, corrected } = input;
  if (!corrected) {
    return { value: resolved, overrides: [], unknownKeys: [] };
  }
  const value = { ...resolved } as T;
  const overrides: string[] = [];
  const unknownKeys: string[] = [];
  for (const [key, override] of Object.entries(corrected)) {
    if (Object.prototype.hasOwnProperty.call(resolved, key)) {
      (value as Record<string, unknown>)[key] = override;
      overrides.push(key);
    } else {
      unknownKeys.push(key);
    }
  }
  return { value, overrides, unknownKeys };
}
