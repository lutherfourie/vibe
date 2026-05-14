import type { Region } from "./types.js";

export function slicePureStructured(source: string): Region[] {
  if (source.length === 0) return [];
  return [
    {
      kind: "structured",
      start: 0,
      end: source.length,
      text: source,
    },
  ];
}
