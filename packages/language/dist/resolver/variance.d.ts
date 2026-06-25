import type { Variance } from "./types.js";
export interface MakeVarianceInput {
    provider: string;
    model: string;
    temperature: number;
    at?: string;
}
export declare function makeVariance(input: MakeVarianceInput): Variance;
export declare function formatVariance(v: Variance): string;
//# sourceMappingURL=variance.d.ts.map