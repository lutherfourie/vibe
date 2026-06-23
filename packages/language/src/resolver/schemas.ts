import { z } from "zod";

export type Branded<T, Brand> = T & { __brand: Brand };

export type LaneId = Branded<string, "LaneId">;
export type CheckpointId = Branded<string, "CheckpointId">;
export type AutonomousSessionId = Branded<string, "AutonomousSessionId">;

export const CheckpointSchema = z.object({
  id: z.string().min(1).brand<"Id">(),
  name: z.string().min(1),
  after: z.string().optional(),
  contract: z.string().optional(),
  resumeStrategy: z.enum(["last-checkpoint", "latest-plan", "explicit"]),
  metadata: z.record(z.string(), z.any()).optional(),
}).strict();

export const SelfReviewSchema = z.object({
  id: z.string().min(1).brand<"Id">(),
  perspective: z.string().optional(),
  criteria: z.array(z.string().min(1)),
  required: z.boolean().default(true),
}).strict();

export const ResearchStepSchema = z.object({
  id: z.string().min(1).brand<"Id">(),
  topic: z.string().min(1),
  depth: z.enum(["shallow", "deep", "xhigh"]).default("deep"),
  sources: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
}).strict();

export const ToolSchema = z.object({
  id: z.string().min(1).brand<"Id">(),
  name: z.string().min(1),
  description: z.string().optional(),
  schema: z.record(z.string(), z.any()).optional(), // JSON Schema for inputs/outputs (industry std OpenAI/MCP tools)
  mcp: z.string().optional(), // MCP server ref
}).strict();

export const EvalSchema = z.object({
  id: z.string().min(1).brand<"Id">(),
  name: z.string().min(1),
  criteria: z.array(z.string().min(1)),
  threshold: z.number().min(0).max(1).optional(),
  llm: z.string().optional(),
}).strict();

export const TemplateSchema = z.object({
  id: z.string().min(1).brand<"Id">(),
  name: z.string().min(1),
  prompt: z.string(),
  variables: z.array(z.string()).optional(),
  fewShot: z.array(z.string()).optional(), // modern prompt engineering
}).strict();

export const PolicySchema = z.object({
  id: z.string().min(1).brand<"Id">(),
  name: z.string().min(1),
  sandbox: z.boolean().default(true),
  rateLimit: z.number().optional(),
  auth: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
}).strict();

export const WorkflowSchema = z.object({
  id: z.string().min(1).brand<"Id">(),
  name: z.string().min(1),
  steps: z.array(z.string()).optional(), // references to steps or lanes; for graph primitives
  parallel: z.boolean().default(false),
  retries: z.number().default(0),
  dependsOn: z.array(z.string()).optional(),
}).strict();

export const CharacterSchema = z.object({
  id: z.string().min(1).brand<"Id">(),
  name: z.string().min(1),
  referencePrompt: z.string(),
  referenceImage: z.string().optional(), // path or hash to canonical Kuma ref
  consistencyRules: z.array(z.string()).optional(), // e.g. "exact orange tabby stripes, white paws, bell collar, kawaii proportions"
}).strict();

export const FrameReviewSchema = z.object({
  id: z.string().min(1).brand<"Id">(),
  name: z.string().min(1),
  animation: z.string(),
  dimensions: z.array(z.string()),
  expertRoles: z.array(z.string()),
  threshold: z.number().optional(),
  kumaConsistency: z.boolean().default(true), // special for Pawfall Kuma matching
}).strict();

export const ConsistencyGuardSchema = z.object({
  id: z.string().min(1).brand<"Id">(),
  name: z.string().min(1),
  character: z.string(),
  rules: z.array(z.string()),
  referenceImage: z.string().optional(),
  autoRegenOnFail: z.boolean().default(true),
  expertPanel: z.array(z.string()).optional(),
}).strict();

// --- Conditional feel/director primitives (additive) -----------------------
// Mirror the grammar's Guard block: a boolean condition plus a list of
// assignments (the feel knobs to set when the guard fires). Both condition and
// assignment values are kept as opaque strings here — the structured AST holds
// the typed form; these schemas describe the resolver/self-plan projection,
// where a guard is summarized as "<condition> -> { target = value, ... }".
export const GuardSchema = z.object({
  condition: z.string().min(1),
  assignments: z.record(z.string(), z.any()).default({}),
}).strict();

export const RuleSchema = z.object({
  id: z.string().min(1).brand<"Id">(),
  name: z.string().min(1),
  fields: z.record(z.string(), z.any()).optional(),
  guards: z.array(GuardSchema).default([]),
}).strict();

export const DirectorSchema = z.object({
  id: z.string().min(1).brand<"Id">(),
  name: z.string().min(1),
  fields: z.record(z.string(), z.any()).optional(),
  guards: z.array(GuardSchema).default([]),
}).strict();

export const StepSchema = z.discriminatedUnion("type", [
  CheckpointSchema.extend({ type: z.literal("checkpoint") }),
  SelfReviewSchema.extend({ type: z.literal("self-review") }),
  ResearchStepSchema.extend({ type: z.literal("research") }),
  ToolSchema.extend({ type: z.literal("tool") }),
  EvalSchema.extend({ type: z.literal("eval") }),
  TemplateSchema.extend({ type: z.literal("template") }),
  PolicySchema.extend({ type: z.literal("policy") }),
  WorkflowSchema.extend({ type: z.literal("workflow") }),
  CharacterSchema.extend({ type: z.literal("character") }),
  FrameReviewSchema.extend({ type: z.literal("frame-review") }),
  ConsistencyGuardSchema.extend({ type: z.literal("consistency-guard") }),
  RuleSchema.extend({ type: z.literal("rule") }),
  DirectorSchema.extend({ type: z.literal("director") }),
]);

export const LaneSchema = z.object({
  id: z.string().min(1).brand<"Id">(),
  name: z.string().min(1),
  steps: z.array(StepSchema),
  skills: z.array(z.string()).optional(),
  config: z.record(z.string(), z.any()).optional(),
}).strict();

export const AutonomousSessionSchema = z.object({
  id: z.string().min(1).brand<"Id">(),
  name: z.string().min(1),
  description: z.string().optional(),
  lanes: z.array(LaneSchema),
  checkpoints: z.array(CheckpointSchema).min(1),
  selfReviews: z.array(SelfReviewSchema).optional(),
  researchSteps: z.array(ResearchStepSchema).optional(),
  resumeOnRestart: z.boolean().default(true),
  metadata: z.record(z.string(), z.any()).optional(),
}).superRefine((data, ctx) => {
  if (data.lanes.length > 1 && data.checkpoints.length === 0) {
    ctx.addIssue({ code: "custom", message: "Multi-lane autonomous sessions must have at least one checkpoint", path: ["checkpoints"] });
  }
  const hasQualityStep = data.lanes.some(lane =>
    lane.steps.some(step => step.type === "self-review" || step.type === "research")
  );
  if (!hasQualityStep) {
    ctx.addIssue({ code: "custom", message: "At least one lane must contain a self-review or research step", path: ["lanes"] });
  }
}).strict();

export const VibePlanSchema = z.object({
  session: AutonomousSessionSchema,
  version: z.string().default("v0.1-autonomous"),
  generatedAt: z.string().datetime(),
  sourceFile: z.string(),
}).strict();

export const ResolverOutputSchema = z.discriminatedUnion("kind", [
  VibePlanSchema.extend({ kind: z.literal("plan") }),
]);

export type Checkpoint = z.infer<typeof CheckpointSchema>;
export type SelfReview = z.infer<typeof SelfReviewSchema>;
export type ResearchStep = z.infer<typeof ResearchStepSchema>;
export type Tool = z.infer<typeof ToolSchema>;
export type Eval = z.infer<typeof EvalSchema>;
export type Template = z.infer<typeof TemplateSchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type Guard = z.infer<typeof GuardSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type Director = z.infer<typeof DirectorSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Lane = z.infer<typeof LaneSchema>;
export type AutonomousSession = z.infer<typeof AutonomousSessionSchema>;
export type VibePlan = z.infer<typeof VibePlanSchema>;
export type ResolverOutput = z.infer<typeof ResolverOutputSchema>;

export const parseResolverOutput = (raw: unknown): ResolverOutput => {
  return ResolverOutputSchema.parse(raw);
};