import { detectShape } from "./detect-shape.js";
import { slicePureStructured } from "./slice-pure.js";
import { sliceMarkdown } from "./slice-markdown.js";
import { sliceConversation } from "./slice-conversation.js";
import type { RegionStream } from "./types.js";

export type { Region, RegionKind, RegionStream, ProseRegion, StructuredRegion, SourceShape } from "./types.js";
export { detectShape } from "./detect-shape.js";

export function dispatchSource(source: string): RegionStream {
  const shape = detectShape(source);
  switch (shape) {
    case "pure-structured":
      return { shape, regions: slicePureStructured(source) };
    case "markdown":
      return { shape, regions: sliceMarkdown(source) };
    case "conversation":
      return { shape, regions: sliceConversation(source) };
  }
}
