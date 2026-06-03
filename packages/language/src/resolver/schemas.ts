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

export const StepSchema = z.discriminatedUnion("type", [
  CheckpointSchema.extend({ type: z.literal("checkpoint") }),
  SelfReviewSchema.extend({ type: z.literal("self-review") }),
  ResearchStepSchema.extend({ type: z.literal("research") }),
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
export type Step = z.infer<typeof StepSchema>;
export type Lane = z.infer<typeof LaneSchema>;
export type AutonomousSession = z.infer<typeof AutonomousSessionSchema>;
export type VibePlan = z.infer<typeof VibePlanSchema>;
export type ResolverOutput = z.infer<typeof ResolverOutputSchema>;

export const parseResolverOutput = (raw: unknown): ResolverOutput => {
  return ResolverOutputSchema.parse(raw);
};