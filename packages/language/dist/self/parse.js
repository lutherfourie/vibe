import { EmptyFileSystem, URI } from "langium";
import { createVibeServices } from "../vibe-module.js";
let nextDocumentId = 1;
export async function parseVibeSource(source, options = {}) {
    const services = createVibeServices(EmptyFileSystem).Vibe;
    const uri = URI.parse(options.uri ?? `file:///vibe-self-${nextDocumentId++}.vibe`);
    const document = services.shared.workspace.LangiumDocumentFactory.fromString(source, uri);
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
//# sourceMappingURL=parse.js.map