// @vibe/language — entry point.
//
// One-stop import for consumers: SD1 (parser + AST + validators) plus the
// SD2 surface (dispatcher, resolver, providers, pipeline, corrections).
// Internal types stay internal.
export const VERSION = "0.0.0";
export * from "./generated/ast.js";
export { createVibeServices, VibeModule } from "./vibe-module.js";
export { registerValidationChecks } from "./vibe-validator.js";
// SD2 surface
export { dispatchSource, detectShape, } from "./dispatcher/index.js";
export { resolveProse, createInMemoryCache, computeCacheKey, makeVariance, formatVariance, } from "./resolver/index.js";
export { createProviderRegistry, createMockProvider, } from "./providers/index.js";
export { createCerebrasProvider } from "./providers/api/cerebras.js";
export { createOpenAIProvider, DEFAULT_OPENAI_MODEL, DEFAULT_OPENAI_PROVIDER_ID, } from "./providers/api/openai.js";
export { createClaudeCliProvider } from "./providers/cli/claude.js";
export { createCodexCliProvider } from "./providers/cli/codex.js";
export { createGrokProvider, } from "./providers/api/grok.js";
export { createBigAgiProvider } from "./providers/api/big-agi.js";
export { mergeCorrected } from "./resolver/corrections.js";
export { getSupabaseClient, persistVibePlan } from "./resolver/persist.js";
export { VibePlanSchema, AutonomousSessionSchema, ToolSchema, EvalSchema, TemplateSchema, PolicySchema, WorkflowSchema, StepSchema } from "./resolver/schemas.js";
export { runPipeline } from "./pipeline/run.js";
export { parseVibeSource, } from "./self/parse.js";
export { extractSelfPlan, extractSelfPlanFromSource, } from "./self/self-plan.js";
//# sourceMappingURL=index.js.map