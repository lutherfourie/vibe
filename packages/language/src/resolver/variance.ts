import type { Variance } from "./types.js";

export interface MakeVarianceInput {
  provider: string;
  model: string;
  temperature: number;
  at?: string;
}

export function makeVariance(input: MakeVarianceInput): Variance {
  return {
    provider: input.provider,
    model: input.model,
    temperature: input.temperature,
    at: input.at ?? new Date().toISOString(),
  };
}

export function formatVariance(v: Variance): string {
  return `resolver: ${v.provider}, model: ${v.model}, t: ${v.temperature}, at: ${v.at}`;
}
