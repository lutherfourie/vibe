import { EmptyFileSystem } from "langium";
import { parseHelper } from "langium/test";
import type { Project } from "../src/generated/ast.js";
import { createVibeServices } from "../src/vibe-module.js";

const services = createVibeServices(EmptyFileSystem).Vibe;

export const parseVibe = parseHelper<Project>(services);

export async function expectParses(source: string): Promise<Project> {
  const document = await parseVibe(source);
  const errors = document.parseResult.lexerErrors.concat(
    document.parseResult.parserErrors,
  );
  if (errors.length > 0) {
    const messages = errors.map((e) => e.message).join("\n");
    throw new Error(`Parse failed:\n${messages}\n\nSource:\n${source}`);
  }
  return document.parseResult.value;
}

export async function expectParseFailure(source: string): Promise<string[]> {
  const document = await parseVibe(source);
  const messages = document.parseResult.lexerErrors
    .concat(document.parseResult.parserErrors)
    .map((e) => e.message);
  if (messages.length === 0) {
    throw new Error(
      `Expected parse failure but source parsed cleanly.\n\nSource:\n${source}`,
    );
  }
  return messages;
}
