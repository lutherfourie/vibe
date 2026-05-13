// @vibe/language — entry point.
//
// Phase 1 scaffold: re-exports the Langium-generated AST + module wiring so
// host packages (the VS Code extension, the future evaluator) can import a
// single surface. The real evaluator, LLM resolver, and init pipeline land
// after the Phase 1 brainstorming session settles language syntax.

export const VERSION = "0.0.0";

export * from "./generated/ast.js";
export {
  VibeGeneratedModule,
  VibeGeneratedSharedModule,
  VibeLanguageMetaData,
} from "./generated/module.js";
export { createVibeServices } from "./vibe-module.js";
