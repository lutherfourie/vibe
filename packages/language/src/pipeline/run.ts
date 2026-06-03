import { EmptyFileSystem, type LangiumDocument } from "langium";
import { parseHelper } from "langium/test";
import type { ZodTypeAny } from "zod";
import { dispatchSource } from "../dispatcher/index.js";
import type { ProseRegion } from "../dispatcher/types.js";
import { resolveProse } from "../resolver/index.js";
import { mergeCorrected } from "../resolver/corrections.js";
import { persistVibePlan } from "../resolver/persist.js";
import type { ResolverResult } from "../resolver/types.js";
import {
  type Corrected,
  type Project,
  isCorrected,
  isStringLiteral,
} from "../generated/ast.js";
import type { ProviderRegistry } from "../providers/index.js";
import { createVibeServices } from "../vibe-module.js";
import { VibePlanSchema, type VibePlan } from "../resolver/schemas.js";

export interface PipelineInput {
  source: string;
  registry: ProviderRegistry;
  defaultResolver: { provider: string; model: string; temperature: number };
  /** Schema used to shape every prose-region resolution. */
  proseSchema?: ZodTypeAny;
}

export interface MergedRegion {
  value: unknown;
  overrides: string[];
  unknownKeys: string[];
  cacheKey: string;
}

export interface PipelineResult {
  shape: ReturnType<typeof dispatchSource>["shape"];
  parseErrors: string[];
  /** Every prose region the resolver produced output for, in source order. */
  resolvedRegions: ResolverResult[];
  /**
   * Resolver outputs that received human overrides via an adjacent
   * `corrected for "<tag>"` block. Only tagged prose regions (i.e. ones
   * authored with a ```vibe-prose#tag fence) whose tag matches a `corrected`
   * declaration appear here. Untagged prose resolutions are present in
   * `resolvedRegions` but never in `mergedRegions`.
   */
  mergedRegions: MergedRegion[];
  diagnostics: string[];
}

// One services container per process; safe to share across calls.
const services = createVibeServices(EmptyFileSystem).Vibe;
const parse = parseHelper<Project>(services);

/** Flatten a `Corrected` AST node's string-literal fields into a plain record. */
function extractFields(corrected: Corrected): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of corrected.fields) {
    if (isStringLiteral(field.value)) {
      out[field.name] = field.value.value;
    }
    // TODO (SD3): handle number/boolean/null/list/object/reference values.
  }
  return out;
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const stream = dispatchSource(input.source);

  const parseErrors: string[] = [];
  /** Tag (from `corrected for "<tag>"`) → field overrides. */
  const correctedByTag = new Map<string, Record<string, unknown>>();
  /** Track which prose region produced each resolver result so we can recover its tag. */
  const resolvedPairs: Array<{ region: ProseRegion; result: ResolverResult }> = [];

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
      const project = document.parseResult.value;
      for (const decl of project.declarations ?? []) {
        if (isCorrected(decl)) {
          correctedByTag.set(decl.target, extractFields(decl));
        }
      }
    } else {
      if (!input.proseSchema) continue; // pipeline configured to ignore prose
      const resolved = await resolveProse({
        region,
        context: {
          provider: input.defaultResolver.provider,
          model: input.defaultResolver.model,
          temperature: input.defaultResolver.temperature,
        },
        schema: input.proseSchema,
        registry: input.registry,
      });
      resolvedPairs.push({ region, result: resolved });
    }
  }

  const resolvedRegions = resolvedPairs.map((p) => p.result);
  // mergedRegions surfaces only the resolver outputs that had a matching
  // `corrected for "<tag>"` block. SD2 v0 keys lookups on the explicit prose
  // tag (```vibe-prose#tagN); untagged prose has no matchable identity yet so
  // it is not exposed here. Callers that just want raw resolver output should
  // read `resolvedRegions`.
  const mergedRegions: MergedRegion[] = [];
  for (const { region, result } of resolvedPairs) {
    if (!region.tag) continue;
    const corrected = correctedByTag.get(region.tag);
    if (!corrected) continue;
    const merge = mergeCorrected({
      resolved: result.value as object,
      corrected: corrected as Partial<object>,
    });
    mergedRegions.push({
      value: merge.value,
      overrides: merge.overrides,
      unknownKeys: merge.unknownKeys,
      cacheKey: result.cacheKey,
    });
  }

  // Wire autonomous dispatch + persist: if any resolved region is a VibePlan (from
  // prose using VibePlanSchema or AutonomousSessionSchema), dispatch note + persist
  // to Supabase (for cross-backend resume + dashboard). Uses any registered provider
  // context; actual "dispatch" here is the resolve that produced the plan + persist.
  // Callers (serve, web, go bridge) can further route the plan to Codex/Claude/Grok/etc.
  for (const r of resolvedRegions) {
    try {
      const val = r.value as any;
      if (val && (val.kind === "plan" || val.session)) {
        const plan = VibePlanSchema.parse(val) as VibePlan;
        // fire-and-forget persist (non-blocking for pipeline)
        persistVibePlan(plan).catch(() => {});
        // TODO: real multi-backend dispatch using registry + plan (e.g. pick provider per lane, call generate for substeps)
      }
    } catch {
      // not a plan, ignore
    }
  }

  return {
    shape: stream.shape,
    parseErrors,
    resolvedRegions,
    mergedRegions,
    diagnostics: [],
  };
}
