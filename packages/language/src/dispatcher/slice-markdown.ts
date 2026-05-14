import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Code, Root } from "mdast";
import type { Region } from "./types.js";

/**
 * Recognized fence langs:
 *   ```vibe              → structured region (parsed by Langium)
 *   ```vibe-prose        → prose region (sent to resolver, no tag)
 *   ```vibe-prose#tag    → prose region with explicit tag for corrected-block matching
 * All other lang values are treated as prose (free markdown text).
 */
interface VibeBlock {
  start: number;
  end: number;
  inner: { start: number; end: number; text: string };
  kind: "structured" | "prose";
  tag?: string;
}

function classifyLang(
  lang: string | null | undefined,
): { kind: "structured" | "prose"; tag?: string } | null {
  if (!lang) return null;
  if (lang === "vibe") return { kind: "structured" };
  if (lang === "vibe-prose") return { kind: "prose" };
  if (lang.startsWith("vibe-prose#")) {
    return { kind: "prose", tag: lang.slice("vibe-prose#".length) };
  }
  return null;
}

export function sliceMarkdown(source: string): Region[] {
  const tree = unified().use(remarkParse).parse(source) as Root;

  const vibeBlocks: VibeBlock[] = [];
  for (const node of tree.children) {
    if (node.type !== "code") continue;
    const code = node as Code;
    const classification = classifyLang(code.lang);
    if (!classification) continue;
    const start = code.position?.start.offset;
    const end = code.position?.end.offset;
    if (start === undefined || end === undefined) continue;

    // mdast gives us positions for the whole block including the fence lines,
    // but `code.value` contains only the inner text. Synthesize inner offsets
    // from the value's length.
    const innerStartLine = source.indexOf("\n", start) + 1;
    const innerEnd = innerStartLine + code.value.length;
    vibeBlocks.push({
      start,
      end,
      inner: { start: innerStartLine, end: innerEnd, text: code.value },
      kind: classification.kind,
      tag: classification.tag,
    });
  }

  const regions: Region[] = [];
  let cursor = 0;
  for (const block of vibeBlocks) {
    if (block.start > cursor) {
      regions.push({
        kind: "prose",
        start: cursor,
        end: block.start,
        text: source.slice(cursor, block.start),
      });
    }
    if (block.kind === "structured") {
      regions.push({
        kind: "structured",
        start: block.inner.start,
        end: block.inner.end,
        text: block.inner.text,
      });
    } else {
      regions.push({
        kind: "prose",
        start: block.inner.start,
        end: block.inner.end,
        text: block.inner.text,
        tag: block.tag,
      });
    }
    cursor = block.end;
  }
  if (cursor < source.length) {
    regions.push({
      kind: "prose",
      start: cursor,
      end: source.length,
      text: source.slice(cursor),
    });
  }
  return regions;
}
