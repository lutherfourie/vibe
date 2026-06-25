import { type LangiumDocument } from "langium";
import type { Project } from "../generated/ast.js";
export interface ParseVibeSourceOptions {
    uri?: string;
    validate?: boolean;
}
export interface ParsedVibeSource {
    document: LangiumDocument<Project>;
    project: Project;
    errors: string[];
}
export declare function parseVibeSource(source: string, options?: ParseVibeSourceOptions): Promise<ParsedVibeSource>;
//# sourceMappingURL=parse.d.ts.map