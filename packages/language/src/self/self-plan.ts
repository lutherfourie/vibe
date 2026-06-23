import {
  isAgent,
  isAutonomousSession,
  isBooleanLiteral,
  isCheckpoint,
  isComparisonExpr,
  isDirector,
  isFallback,
  isLane,
  isListExpression,
  isLogicalExpr,
  isMemory,
  isNullLiteral,
  isNumberLiteral,
  isObjectExpression,
  isOperand,
  isPlugin,
  isProvider,
  isRange,
  isReference,
  isResearchStep,
  isRoute,
  isRule,
  isSelfReview,
  isStringLiteral,
  isSurface,
  type Agent,
  type AutonomousSession,
  type Assignment,
  type Checkpoint,
  type Condition,
  type Director,
  type Expression,
  type Field,
  type Guard,
  type Lane,
  type Memory,
  type Plugin,
  type Project,
  type Provider,
  type QualifiedName,
  type Reference,
  type ResearchStep,
  type Rule,
  type SelfReview,
  type Surface,
} from "../generated/ast.js";
import { parseVibeSource } from "./parse.js";

export interface VibeSelfPlan {
  name: string;
  source: string;
  repo?: string;
  providers: SelfProvider[];
  routes: Record<string, string>;
  fallback?: string;
  surfaces: SelfSurface[];
  agents: SelfAgent[];
  lanes: SelfLane[];
  gates: SelfGate[];
  autonomousSessions: SelfAutonomousSession[];
  rules: SelfRule[];
  directors: SelfRule[];
  notes: string[];
}

export interface SelfGuard {
  condition: string;
  assignments: Record<string, unknown>;
}

export interface SelfRule {
  name: string;
  fields: Record<string, unknown>;
  guards: SelfGuard[];
}

export interface SelfAutonomousSession {
  name: string;
  description?: string;
  laneCount: number;
  checkpointCount: number;
  metadata: Record<string, unknown>;
}

export interface SelfSurface {
  name: string;
  kind?: string;
  mode?: string;
  metadata: Record<string, unknown>;
}

export interface SelfProvider {
  name: string;
  mode?: string;
  model?: string;
  metadata: Record<string, unknown>;
}

export interface SelfAgent {
  name: string;
  persona?: string;
  memory?: string;
  harness?: string;
  uses: string[];
}

export interface SelfLane {
  name: string;
  impl?: string;
  owns?: string;
  emits?: string;
  target?: string;
  reads?: string[];
  verify?: string[];
  approval?: string;
  metadata: Record<string, unknown>;
}

export interface SelfGate {
  name: string;
  impl?: string;
  owns?: string;
  emits?: string;
  metadata: Record<string, unknown>;
}

export async function extractSelfPlanFromSource(
  source: string,
  options: { sourceName?: string; uri?: string; name?: string } = {},
): Promise<VibeSelfPlan> {
  const parsed = await parseVibeSource(source, { uri: options.uri });
  if (parsed.errors.length > 0) {
    throw new Error(`Cannot extract self-plan:\n${parsed.errors.join("\n")}`);
  }
  return extractSelfPlan(parsed.project, {
    name: options.name,
    sourceName: options.sourceName ?? options.uri ?? "inline",
  });
}

export function extractSelfPlan(
  project: Project,
  options: { sourceName?: string; name?: string } = {},
): VibeSelfPlan {
  const plugins = project.declarations.filter(isPlugin);
  const agents = project.declarations.filter(isAgent).map(readAgent);
  const memory = project.declarations.find(isMemory);
  const lanes = plugins
    .filter((plugin) => plugin.name.endsWith("_lane"))
    .map(readLane);
  const gates = plugins
    .filter((plugin) => plugin.name.endsWith("_gate"))
    .map(readGate);
  const autonomousSessions = project.declarations
    .filter(isAutonomousSession)
    .map(readAutonomousSession);
  const rules = project.declarations.filter(isRule).map(readRuleOrDirector);
  const directors = project.declarations
    .filter(isDirector)
    .map(readRuleOrDirector);

  return {
    name: options.name ?? "vibe-self",
    source: options.sourceName ?? "unknown",
    repo: memory ? readRepo(memory) : undefined,
    providers: project.declarations.filter(isProvider).map(readProvider),
    routes: readRoutes(project),
    fallback: readFallback(project),
    surfaces: project.declarations.filter(isSurface).map(readSurface),
    agents,
    lanes,
    gates,
    autonomousSessions,
    rules,
    directors,
    notes: [
      "This is a provisional self-plan extracted from current Vibe primitives.",
      "Plugins ending in _lane are treated as lanes until lane syntax exists.",
      "Plugins ending in _gate are treated as gates until gate syntax exists.",
      "Native autonomous-session/lane/checkpoint/self-review/research-step are now first-class (Langium + Zod).",
      "Native rule/director carry `when { ... } then { ... }` conditional guards (Feel Compiler primitives).",
    ],
  };
}

/**
 * Project a `rule` or `director` declaration into its self-plan shape: the
 * ordinary metadata Fields become a flat record, and each `when { ... } then
 * { ... }` Guard becomes a stringified condition plus an assignments map. Rule
 * and Director share the same body shape (Field | Guard), so one reader covers
 * both.
 */
function readRuleOrDirector(decl: Rule | Director): SelfRule {
  return {
    name: decl.name,
    fields: readMetadataForAny(decl),
    guards: decl.guards.map(readGuard),
  };
}

function readGuard(guard: Guard): SelfGuard {
  const assignments: Record<string, unknown> = {};
  for (const assignment of guard.assignments) {
    assignments[referencePath(assignment.target)] = assignmentValue(assignment);
  }
  return {
    condition: conditionToString(guard.condition),
    assignments,
  };
}

function assignmentValue(assignment: Assignment): unknown {
  const value = assignment.value;
  if (isRange(value)) {
    return { low: value.low.value, high: value.high.value };
  }
  // ExpressionValue wraps a plain data Expression.
  return expressionValue(value.value);
}

/**
 * Render a parsed Condition back to a compact infix string for the self-plan
 * projection (the structured AST is the authority; this is a human/JSON-facing
 * summary). Parenthesizes nested logical/comparison nodes to preserve grouping.
 */
function conditionToString(condition: Condition): string {
  if (isOperand(condition)) {
    if (condition.ref) return referencePath(condition.ref);
    if (condition.number) return String(condition.number.value);
    if (condition.string) return JSON.stringify(condition.string.value);
    if (condition.boolean) return condition.boolean.value;
    return "";
  }
  if (isComparisonExpr(condition) || isLogicalExpr(condition)) {
    const left = wrapIfCompound(condition.left);
    const right = wrapIfCompound(condition.right);
    return `${left} ${condition.operator} ${right}`;
  }
  return "";
}

function wrapIfCompound(condition: Condition): string {
  const rendered = conditionToString(condition);
  if (isComparisonExpr(condition) || isLogicalExpr(condition)) {
    return `(${rendered})`;
  }
  return rendered;
}

function readProvider(provider: Provider): SelfProvider {
  const metadata = readMetadata(provider);
  return {
    name: qualifiedName(provider.name),
    mode: stringValue(metadata.mode),
    model: stringValue(metadata.model),
    metadata,
  };
}

function readAgent(agent: Agent): SelfAgent {
  const fields = fieldMap(agent.fields);
  return {
    name: agent.name,
    persona: referenceName(fields.get("persona")),
    memory: referenceName(fields.get("memory")),
    harness: referenceName(fields.get("harness")),
    uses: listReferences(fields.get("uses")),
  };
}

function readLane(plugin: Plugin): SelfLane {
  const metadata = readMetadata(plugin);
  return {
    name: plugin.name,
    impl: stringValue(metadata.impl),
    owns: stringValue(metadata.owns),
    emits: stringValue(metadata.emits),
    target: stringValue(metadata.target),
    reads: stringListValue(metadata.reads),
    verify: stringListValue(metadata.verify),
    approval: stringValue(metadata.approval),
    metadata,
  };
}

function readSurface(surface: Surface): SelfSurface {
  const metadata = readMetadata(surface);
  return {
    name: qualifiedName(surface.name),
    kind: stringValue(metadata.kind),
    mode: stringValue(metadata.mode),
    metadata,
  };
}

function readGate(plugin: Plugin): SelfGate {
  const metadata = readMetadata(plugin);
  return {
    name: plugin.name,
    impl: stringValue(metadata.impl),
    owns: stringValue(metadata.owns),
    emits: stringValue(metadata.emits),
    metadata,
  };
}

function readAutonomousSession(sess: AutonomousSession): SelfAutonomousSession {
  const metadata = readMetadataForAny(sess);
  // Count nested via fields if present (prose objects or future structured); fallback 0
  const lanesField = sess.fields.find((f) => f.name === "lanes");
  const checkpointsField = sess.fields.find((f) => f.name === "checkpoints");
  const laneCount = lanesField && isListExpression(lanesField.value) ? lanesField.value.items.length : 0;
  const checkpointCount = checkpointsField && isListExpression(checkpointsField.value) ? checkpointsField.value.items.length : 0;
  return {
    name: sess.name,
    description: stringValue(metadata.description),
    laneCount,
    checkpointCount,
    metadata,
  };
}

function readMetadataForAny(source: { fields: Field[] }): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  for (const field of source.fields) {
    metadata[field.name] = expressionValue(field.value);
  }
  return metadata;
}

function readMetadata(source: Plugin | Provider | Surface): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  for (const field of source.fields) {
    metadata[field.name] = expressionValue(field.value);
  }
  return metadata;
}

function readRepo(memory: Memory): string | undefined {
  const fields = fieldMap(memory.fields);
  return stringValue(expressionValue(fields.get("namespace")));
}

function readRoutes(project: Project): Record<string, string> {
  const routes: Record<string, string> = {};
  for (const route of project.declarations.filter(isRoute)) {
    routes[route.from] = qualifiedName(route.to);
  }
  return routes;
}

function readFallback(project: Project): string | undefined {
  const fallback = project.declarations.find(isFallback);
  return fallback ? qualifiedName(fallback.to) : undefined;
}

function fieldMap(fields: Field[]): Map<string, Expression> {
  const map = new Map<string, Expression>();
  for (const field of fields) {
    map.set(field.name, field.value);
  }
  return map;
}

function expressionValue(expression: Expression | undefined): unknown {
  if (!expression) return undefined;
  if (isStringLiteral(expression)) return expression.value;
  if (isNumberLiteral(expression)) return expression.value;
  if (isBooleanLiteral(expression)) return expression.value === "true";
  if (isNullLiteral(expression)) return null;
  if (isReference(expression)) return referencePath(expression);
  if (isListExpression(expression)) {
    return expression.items.map((item) => expressionValue(item));
  }
  if (isObjectExpression(expression)) {
    const out: Record<string, unknown> = {};
    for (const entry of expression.entries) {
      out[entry.key] = expressionValue(entry.value);
    }
    return out;
  }
  return undefined;
}

function referenceName(expression: Expression | undefined): string | undefined {
  if (!expression || !isReference(expression)) return undefined;
  return referencePath(expression);
}

function listReferences(expression: Expression | undefined): string[] {
  if (!expression || !isListExpression(expression)) return [];
  return expression.items
    .filter(isReference)
    .map(referencePath);
}

function referencePath(reference: Reference): string {
  return reference.segments.join(".");
}

function qualifiedName(name: QualifiedName): string {
  return name.segments.join(".");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringListValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (!value.every((item) => typeof item === "string")) return undefined;
  return value;
}
