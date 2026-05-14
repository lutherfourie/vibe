import type { ProseRegion, Region } from "./types.js";

const ROLE_RE = /^###\s+(user|assistant|system)\b[^\n]*$/gm;
const FENCED_VIBE_RE = /```vibe\n([\s\S]*?)```/g;

type Role = "user" | "assistant" | "system";

interface Turn {
  role: Role;
  bodyStart: number;
  bodyEnd: number;
  bodyText: string;
}

function findTurns(source: string): Turn[] {
  const matches = [...source.matchAll(ROLE_RE)];
  if (matches.length === 0) {
    throw new Error("sliceConversation requires at least one `### user|assistant|system` role tag");
  }
  const turns: Turn[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const role = m[1] as Role;
    const tagStart = m.index!;
    const bodyStart = tagStart + m[0].length + 1; // +1 for the newline after the tag
    const next = matches[i + 1];
    const bodyEnd = next ? next.index! : source.length;
    turns.push({
      role,
      bodyStart,
      bodyEnd,
      bodyText: source.slice(bodyStart, bodyEnd),
    });
  }
  return turns;
}

function splitTurnByFences(turn: Turn): Region[] {
  const regions: Region[] = [];
  let cursor = turn.bodyStart;
  for (const m of turn.bodyText.matchAll(FENCED_VIBE_RE)) {
    const fenceStartInTurn = m.index!;
    const fenceEndInTurn = fenceStartInTurn + m[0].length;
    const fenceStartGlobal = turn.bodyStart + fenceStartInTurn;
    const fenceEndGlobal = turn.bodyStart + fenceEndInTurn;

    if (fenceStartGlobal > cursor) {
      regions.push({
        kind: "prose",
        role: turn.role,
        start: cursor,
        end: fenceStartGlobal,
        text: turn.bodyText.slice(cursor - turn.bodyStart, fenceStartGlobal - turn.bodyStart),
      } satisfies ProseRegion);
    }
    regions.push({
      kind: "structured",
      start: fenceStartGlobal,
      end: fenceEndGlobal,
      text: m[1] ?? "", // inner content between ```vibe\n and ```
    });
    cursor = fenceEndGlobal;
  }
  if (cursor < turn.bodyEnd) {
    regions.push({
      kind: "prose",
      role: turn.role,
      start: cursor,
      end: turn.bodyEnd,
      text: turn.bodyText.slice(cursor - turn.bodyStart),
    } satisfies ProseRegion);
  }
  return regions;
}

export function sliceConversation(source: string): Region[] {
  const turns = findTurns(source);
  return turns.flatMap(splitTurnByFences);
}
