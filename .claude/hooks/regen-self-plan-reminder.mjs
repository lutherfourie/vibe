#!/usr/bin/env node
import { readFileSync } from "node:fs";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const filePath = payload?.tool_input?.file_path;
if (typeof filePath !== "string") process.exit(0);

const normalized = filePath.replaceAll("\\", "/");
if (!normalized.endsWith("examples/vibe-self.vibe")) process.exit(0);

process.stdout.write(
  "examples/vibe-self.vibe changed. Regenerate the self-plan before considering this task complete:\n" +
    "  pnpm run self:plan\n" +
    "This rewrites docs/examples/vibe-self-plan.json from the source.\n"
);
process.exit(0);
