import { EmptyFileSystem, URI, type LangiumDocument } from "langium";
import type { Project } from "../generated/ast.js";
import { createVibeServices } from "../vibe-module.js";

export interface ParseVibeSourceOptions {
  uri?: string;
  validate?: boolean;
}

export interface ParsedVibeSource {
  document: LangiumDocument<Project>;
  project: Project;
  errors: string[];
}

let nextDocumentId = 1;

export async function parseVibeSource(
  source: string,
  options: ParseVibeSourceOptions = {},
): Promise<ParsedVibeSource> {
  const services = createVibeServices(EmptyFileSystem).Vibe;
  const uri = URI.parse(
    options.uri ?? `file:///vibe-self-${nextDocumentId++}.vibe`,
  );
  const document = services.shared.workspace.LangiumDocumentFactory.fromString<Project>(
    source,
    uri,
  );

  services.shared.workspace.LangiumDocuments.addDocument(document);
  await services.shared.workspace.DocumentBuilder.build([document], {
    validation: options.validate ?? true,
  });

  const parserErrors = [
    ...document.parseResult.lexerErrors,
    ...document.parseResult.parserErrors,
  ].map((error) => `parse: ${error.message}`);
  const validationErrors = (document.diagnostics ?? [])
    .filter((diagnostic) => diagnostic.severity === 1)
    .map((diagnostic) => `validation: ${diagnostic.message}`);

  return {
    document,
    project: document.parseResult.value,
    errors: [...parserErrors, ...validationErrors],
  };
}
