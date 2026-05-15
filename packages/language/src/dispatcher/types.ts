export type SourceShape =
  | "pure-structured"
  | "markdown"
  | "conversation";

export type RegionKind = "structured" | "prose";

export interface BaseRegion {
  kind: RegionKind;
  /** Byte offset of region start in the original source. */
  start: number;
  /** Byte offset of region end (exclusive) in the original source. */
  end: number;
  /** Source text for the region, verbatim (no trim). */
  text: string;
}

export interface StructuredRegion extends BaseRegion {
  kind: "structured";
}

export interface ProseRegion extends BaseRegion {
  kind: "prose";
  /** Optional tag for prose regions in conversation files: "user" | "assistant" | "system". */
  role?: "user" | "assistant" | "system";
  /** Optional resolver tag from a fenced code-block info string (e.g. ```vibe-prose#tag123). */
  tag?: string;
}

export type Region = StructuredRegion | ProseRegion;

export interface RegionStream {
  shape: SourceShape;
  regions: Region[];
}
