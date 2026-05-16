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
export {
  dispatchSource,
  detectShape,
  type Region,
  type RegionKind,
  type RegionStream,
  type ProseRegion,
  type StructuredRegion,
  type SourceShape,
} from "./dispatcher/index.js";

export {
  resolveProse,
  createInMemoryCache,
  computeCacheKey,
  makeVariance,
  formatVariance,
  type ResolverContext,
  type ResolverResult,
  type Variance,
  type PrimitivesSummary,
} from "./resolver/index.js";

export {
  createProviderRegistry,
  createMockProvider,
  type ProviderAdapter,
  type ProviderMode,
  type ChatMessage,
  type ChatRole,
  type GenerateObjectRequest,
  type GenerateObjectResponse,
} from "./providers/index.js";

export { createCerebrasProvider } from "./providers/api/cerebras.js";
export {
  createOpenAIProvider,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_PROVIDER_ID,
  type OpenAIProviderOptions,
} from "./providers/api/openai.js";
export { createClaudeCliProvider } from "./providers/cli/claude.js";
export { mergeCorrected } from "./resolver/corrections.js";
export { runPipeline, type PipelineInput, type PipelineResult } from "./pipeline/run.js";

export {
  parseVibeSource,
  type ParsedVibeSource,
  type ParseVibeSourceOptions,
} from "./self/parse.js";

export {
  extractSelfPlan,
  extractSelfPlanFromSource,
  type SelfAgent,
  type SelfGate,
  type SelfLane,
  type SelfProvider,
  type VibeSelfPlan,
} from "./self/self-plan.js";
