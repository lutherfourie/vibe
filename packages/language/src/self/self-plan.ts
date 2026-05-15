import {
  isAgent,
  isBooleanLiteral,
  isFallback,
  isListExpression,
  isMemory,
  isNullLiteral,
  isNumberLiteral,
  isObjectExpression,
  isPlugin,
  isReference,
  isRoute,
  isStringLiteral,
  isSurface,
  type Agent,
  type Expression,
  type Field,
  type Memory,
  type Plugin,
  type Project,
  type QualifiedName,
  type Reference,
  type Surface,
} from "../generated/ast.js";
import { parseVibeSource } from "./parse.js";

export interface VibeSelfPlan {
  name: string;
  source: string;
  repo?: string;
  routes: Record<string, string>;
  fallback?: string;
  surfaces: SelfSurface[];
  agents: SelfAgent[];
  lanes: SelfLane[];
  gates: SelfGate[];
  notes: string[];
}

export interface SelfSurface {
  name: string;
  kind?: string;
  mode?: string;
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
  options: { sourceName?: string; uri?: string } = {},
): Promise<VibeSelfPlan> {
  const parsed = await parseVibeSource(source, { uri: options.uri });
  if (parsed.errors.length > 0) {
    throw new Error(`Cannot extract self-plan:\n${parsed.errors.join("\n")}`);
  }
  return extractSelfPlan(parsed.project, {
    sourceName: options.sourceName ?? options.uri ?? "inline",
  });
}

export function extractSelfPlan(
  project: Project,
  options: { sourceName?: string } = {},
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

  return {
    name: "vibe-self",
    source: options.sourceName ?? "unknown",
    repo: memory ? readRepo(memory) : undefined,
    routes: readRoutes(project),
    fallback: readFallback(project),
    surfaces: project.declarations.filter(isSurface).map(readSurface),
    agents,
    lanes,
    gates,
    notes: [
      "This is a provisional self-plan extracted from current Vibe primitives.",
      "Plugins ending in _lane are treated as lanes until lane syntax exists.",
      "Plugins ending in _gate are treated as gates until gate syntax exists.",
    ],
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

function readMetadata(source: Plugin | Surface): Record<string, unknown> {
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
