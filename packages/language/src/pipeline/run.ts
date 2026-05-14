import { EmptyFileSystem, type LangiumDocument } from "langium";
import { parseHelper } from "langium/test";
import { dispatchSource } from "../dispatcher/index.js";
import type { ResolverResult } from "../resolver/types.js";
import type { Project } from "../generated/ast.js";
import type { ProviderRegistry } from "../providers/index.js";
import { createVibeServices } from "../vibe-module.js";

export interface PipelineInput {
  source: string;
  registry: ProviderRegistry;
  defaultResolver: { provider: string; model: string; temperature: number };
}

export interface PipelineResult {
  shape: ReturnType<typeof dispatchSource>["shape"];
  parseErrors: string[];
  resolvedRegions: ResolverResult[];
  diagnostics: string[];
}

// One services container per process; safe to share across calls.
const services = createVibeServices(EmptyFileSystem).Vibe;
const parse = parseHelper<Project>(services);

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const stream = dispatchSource(input.source);

  const parseErrors: string[] = [];
  const resolvedRegions: ResolverResult[] = [];

  for (const region of stream.regions) {
    if (region.kind === "structured") {
      const document = await parse(region.text);
      const lexerMessages = document.parseResult.lexerErrors.map((e) => e.message);
      const parserMessages = document.parseResult.parserErrors.map((e) => e.message);
      parseErrors.push(...lexerMessages, ...parserMessages);
      await services.shared.workspace.DocumentBuilder.build(
        [document as LangiumDocument],
        { validation: true },
      );
    } else {
      // Prose handling lands in Task 21.
    }
  }

  return {
    shape: stream.shape,
    parseErrors,
    resolvedRegions,
    diagnostics: [],
  };
}
