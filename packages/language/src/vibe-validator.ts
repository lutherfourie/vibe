/**
 * Vibe v0 validators — Task 15: name policy. Task 16: reserved route name.
 * Task 17: cross-reference resolution.
 *
 * Concerns:
 *
 *   - Duplicate declaration names within a project. Two `agent foo` blocks
 *     (or two `provider x.y`, two `route resolver -> ...`, etc.) leave the
 *     runtime with two competing definitions for the same logical handle,
 *     so we surface a diagnostic on every offending node.
 *
 *   - Missing required `resolver` route. Spec §2.2 reserves `resolver` as
 *     the LLM-resolver sink and says "REQUIRED; build fails if absent" for
 *     any project that has work to wire. v0 reads that as: a project that
 *     declares at least one agent or at least one route MUST also declare a
 *     `route resolver -> <provider>`. An empty .vibe file (purely whitespace
 *     / comments, or that only carries provider/persona/memory/harness/plugin
 *     declarations with no agent + no route at all) is exempt — there is
 *     nothing to resolve from, so the missing-resolver diagnostic would be
 *     noise. The moment the file grows an agent or a route, the requirement
 *     kicks in.
 *
 *   - Cross-reference resolution. Every `Reference` AST node whose first
 *     segment is one of the nine declaration-kind keywords (`agent`,
 *     `route`, `persona`, `memory`, `harness`, `plugin`, `provider`,
 *     `trigger`, `fallback`) must have its second segment match a declared
 *     name of that kind. Catches the most common authoring typo —
 *     `uses = [plugin.assett_pipeline]` when the real declaration is
 *     `plugin asset_pipeline { ... }`. Three-segment `plugin.X.tool`
 *     references only validate the plugin segment; the tool segment is a
 *     runtime concern (spec §2.4) because tools live inside the TS module
 *     and aren't statically knowable. Bare-identifier references whose
 *     first segment isn't a kind keyword (e.g. `pushback = high`,
 *     `mode = api`) are skipped — they're enum-ish values, not cross-refs.
 *
 * Non-concerns (intentional, see test file for the long form):
 *
 *   - Reserved literal-word names (`agent true {}`, `route null -> x`,
 *     `persona false { ... }`). The grammar binds declaration headers to
 *     `name=ID`, and `true`/`false`/`null` are lexed as their literal
 *     keywords — the parser rejects them before any AST node exists, so a
 *     runtime validator would never see them. The reserved-word contract is
 *     enforced at parse time and asserted in `duplicate-declarations.test.ts`.
 *
 *   - Cross-kind name collisions (e.g. `agent foo` + `persona foo`). The
 *     plan scopes Task 15 to same-kind duplicates only; agents and personas
 *     live in different reference namespaces (`agent.foo` vs `persona.foo`),
 *     so sharing a bare name is not actually ambiguous.
 *
 * Wiring: `registerValidationChecks` is called from `createVibeServices`
 * after the Vibe services container is assembled. Each AST root that owns
 * the declaration list gets a single Project-level check that loops over
 * children once and reports per-kind duplicates.
 */

import type { ValidationAcceptor, ValidationChecks } from "langium";
import type {
  Agent,
  Harness,
  Memory,
  Persona,
  Plugin,
  Project,
  Provider,
  Reference as VibeReference,
  Route,
  VibeAstType,
} from "./generated/ast.js";
import type { LangiumServices } from "langium/lsp";

/**
 * AST node types that bind a single-identifier or qualified-name handle
 * which the project's runtime resolves to a specific declaration. Trigger
 * and Fallback are deliberately excluded — neither has a name slot, so
 * duplication is a different concern (cron schedule collision, fallback
 * target conflict) that future tasks will address.
 */
type NamedDeclaration =
  | Agent
  | Persona
  | Memory
  | Harness
  | Plugin
  | Provider
  | Route;

/**
 * Stable lowercase label used in diagnostics. Matches the keyword each
 * primitive's grammar rule fires on, so the message reads naturally next to
 * the source ("Duplicate agent declaration: izsha").
 */
const KIND_LABEL: Record<NamedDeclaration["$type"], string> = {
  Agent: "agent",
  Persona: "persona",
  Memory: "memory",
  Harness: "harness",
  Plugin: "plugin",
  Provider: "provider",
  Route: "route",
};

function isNamedDeclaration(node: unknown): node is NamedDeclaration {
  const type = (node as { $type?: string } | null)?.$type;
  return (
    type === "Agent" ||
    type === "Persona" ||
    type === "Memory" ||
    type === "Harness" ||
    type === "Plugin" ||
    type === "Provider" ||
    type === "Route"
  );
}

/**
 * Project-keyed grammar handle. For `Provider` it's the dotted segments
 * joined by `.` (the qualified name as written); for `Route` it's the
 * `from` identifier (the route's logical handle); for the rest it's just
 * `name`. Returns `undefined` when the parser produced a partial AST node
 * with no name bound (parse error path) — those are skipped so the
 * validator doesn't pile on top of an existing parser diagnostic.
 */
function declarationKey(decl: NamedDeclaration): string | undefined {
  switch (decl.$type) {
    case "Provider":
      return decl.name?.segments?.join(".");
    case "Route":
      return decl.from;
    default:
      return decl.name;
  }
}

/**
 * Emit the diagnostic on the property that holds the declaration's handle,
 * so IDE markers underline the offending identifier rather than the entire
 * block. Most primitives use `name`; `Route` uses `from`. The branching
 * here also serves as a per-node TypeScript narrowing: `accept`'s
 * `property` field is typed as `Properties<N>`, which differs per AST
 * variant, so we cannot share a single object literal.
 */
function reportDuplicate(
  decl: NamedDeclaration,
  message: string,
  accept: ValidationAcceptor,
): void {
  if (decl.$type === "Route") {
    accept("error", message, { node: decl, property: "from" });
  } else {
    accept("error", message, { node: decl, property: "name" });
  }
}

export class VibeValidator {
  /**
   * Walk the project's declaration list once, bucket by (kind, key), and
   * emit a diagnostic on every member of any bucket with more than one
   * entry. Reporting on every offender (rather than just the second one)
   * gives IDE users a marker on each conflicting site, which matches how
   * Langium-built languages typically surface duplicate-symbol errors.
   */
  checkDuplicateDeclarations(
    project: Project,
    accept: ValidationAcceptor,
  ): void {
    const buckets = new Map<string, NamedDeclaration[]>();

    for (const decl of project.declarations) {
      if (!isNamedDeclaration(decl)) continue;
      const key = declarationKey(decl);
      if (key === undefined || key === "") continue;
      const bucketKey = `${decl.$type}:${key}`;
      const bucket = buckets.get(bucketKey) ?? [];
      bucket.push(decl);
      buckets.set(bucketKey, bucket);
    }

    for (const bucket of buckets.values()) {
      if (bucket.length < 2) continue;
      const first = bucket[0];
      if (first === undefined) continue; // satisfies noUncheckedIndexedAccess
      const label = KIND_LABEL[first.$type];
      const name = declarationKey(first);
      if (name === undefined) continue;
      const message = `Duplicate ${label} declaration: ${name}`;
      for (const decl of bucket) {
        reportDuplicate(decl, message, accept);
      }
    }
  }

  /**
   * Spec §2.2: `route resolver -> X` is the reserved sink for the LLM
   * resolver. Any project with actual work to do — at least one agent or at
   * least one route — must declare it; without resolver, the runtime has no
   * default route for prose / unmatched LLM calls and `vibe build` would
   * fail downstream. We fail-fast here so the IDE marker shows up next to
   * the source instead of buried in a build error.
   *
   * Exemption: a project that declares neither an agent nor a route (only
   * providers/personas/memory/harness/plugin, or a literally empty file)
   * has nothing to route, so the missing-resolver diagnostic would be noise.
   * The duplicate-declarations tests rely on this exemption — they exercise
   * persona/memory/harness/plugin duplicate detection in projects that
   * legitimately don't declare any routes or agents.
   *
   * The diagnostic anchors on the Project root rather than a specific
   * declaration because the offence is structural (absence of a node), not
   * a property of any existing node. Editors render Project-level diagnostics
   * at the document head, which is the natural place for "this file is
   * missing a required top-level declaration".
   */
  checkResolverRoute(project: Project, accept: ValidationAcceptor): void {
    let hasAgent = false;
    let hasRoute = false;
    let hasResolver = false;
    for (const decl of project.declarations) {
      if (decl.$type === "Agent") {
        hasAgent = true;
      } else if (decl.$type === "Route") {
        hasRoute = true;
        if (decl.from === "resolver") {
          hasResolver = true;
        }
      }
    }
    if (!hasAgent && !hasRoute) return;
    if (hasResolver) return;
    accept(
      "error",
      "Missing required route `resolver`. Every Vibe project must declare `route resolver -> <provider>`.",
      { node: project },
    );
  }

  /**
   * Walk every Reference node in the project and require that any reference
   * whose first segment is a recognized declaration-kind keyword resolves to
   * a declared name of that kind. The walker visits the whole AST (not just
   * top-level declarations) because references can nest arbitrarily deep
   * inside lists, object expressions, and trigger fields.
   *
   * Three rules of the road, each load-bearing:
   *
   *   1. Provider names are dotted, so the declared-name set joins
   *      `decl.name.segments` with `.`. Every other primitive binds a single
   *      ID and uses `decl.name` directly. Route uses `decl.from`.
   *
   *   2. Bare-identifier references are skipped if their first segment isn't
   *      a kind keyword. `pushback = high` parses `high` as a Reference (the
   *      grammar reuses bare ids as references at expression position), but
   *      the validator is not an enum checker — those are advisory values,
   *      not cross-refs.
   *
   *   3. `plugin.<name>.<tool>` (three-segment) only validates the plugin
   *      name. Tool names live inside the TS plugin module (spec §2.4) and
   *      aren't knowable without importing the module, so v0 leaves the
   *      tool segment to the runtime.
   *
   * The walker uses an `unknown` traversal rather than a typed visitor so
   * we don't have to enumerate every container shape (Field, ListExpression,
   * ObjectEntry, Trigger fields, ...) by hand. Any future grammar addition
   * that introduces a new container of expressions gets covered for free.
   */
  checkCrossReferences(project: Project, accept: ValidationAcceptor): void {
    const declared: Record<CrossRefKind, Set<string>> = {
      agent: new Set<string>(),
      route: new Set<string>(),
      persona: new Set<string>(),
      memory: new Set<string>(),
      harness: new Set<string>(),
      plugin: new Set<string>(),
      provider: new Set<string>(),
      trigger: new Set<string>(),
      fallback: new Set<string>(),
    };

    for (const decl of project.declarations) {
      switch (decl.$type) {
        case "Agent":
          declared.agent.add(decl.name);
          break;
        case "Route":
          declared.route.add(decl.from);
          break;
        case "Persona":
          declared.persona.add(decl.name);
          break;
        case "Memory":
          declared.memory.add(decl.name);
          break;
        case "Harness":
          declared.harness.add(decl.name);
          break;
        case "Plugin":
          declared.plugin.add(decl.name);
          break;
        case "Provider":
          declared.provider.add(decl.name.segments.join("."));
          break;
        // Trigger and Fallback have no name slot; they're listed in
        // CROSS_REF_KINDS for completeness (the spec lists them as kind
        // keywords) but never accept references back to themselves at v0.
      }
    }

    const visit = (node: unknown): void => {
      if (node === null || typeof node !== "object") return;
      const typed = node as { $type?: string };
      if (typed.$type === "Reference") {
        const ref = node as VibeReference;
        const head = ref.segments[0];
        const tail = ref.segments[1];
        if (head !== undefined && tail !== undefined && isCrossRefKind(head)) {
          if (!declared[head].has(tail)) {
            accept("error", `Unknown ${head} reference: ${tail}`, {
              node: ref,
            });
          }
        }
        // Stop descending: Reference nodes have only `segments: string[]`,
        // nothing meaningful to recurse into and the strings would otherwise
        // be visited as character-indexed objects on some engines.
        return;
      }
      // Walk only own enumerable properties, and skip the Langium AST
      // back-references (`$container`, `$cstNode`, `$document`, etc.) that
      // would otherwise create cycles and blow the stack. The convention is
      // that every Langium-internal property starts with `$`; the AST's own
      // semantic fields don't.
      for (const key of Object.keys(node)) {
        if (key.startsWith("$")) continue;
        const value = (node as Record<string, unknown>)[key];
        if (Array.isArray(value)) {
          for (const item of value) visit(item);
        } else if (value !== null && typeof value === "object") {
          visit(value);
        }
      }
    };

    visit(project);
  }
}

/**
 * The nine declaration-kind keywords that the grammar treats as the head of
 * a cross-reference path. Trigger and Fallback have no bindable name at v0
 * so their declared-name sets are always empty, but we keep them in the
 * union so the spec's list stays authoritative — any reference like
 * `trigger.foo` would correctly report "Unknown trigger reference: foo"
 * because nothing can populate that set today.
 */
const CROSS_REF_KINDS = [
  "agent",
  "route",
  "persona",
  "memory",
  "harness",
  "plugin",
  "provider",
  "trigger",
  "fallback",
] as const;
type CrossRefKind = (typeof CROSS_REF_KINDS)[number];

function isCrossRefKind(value: string): value is CrossRefKind {
  return (CROSS_REF_KINDS as readonly string[]).includes(value);
}

/**
 * Register all Vibe validation checks against the AST node types they
 * inspect. Called from `createVibeServices` after the container is built.
 */
export function registerValidationChecks(services: LangiumServices): void {
  const registry = services.validation.ValidationRegistry;
  const validator = new VibeValidator();
  const checks: ValidationChecks<VibeAstType> = {
    Project: [
      validator.checkDuplicateDeclarations.bind(validator),
      validator.checkResolverRoute.bind(validator),
      validator.checkCrossReferences.bind(validator),
    ],
  };
  registry.register(checks, validator);
}
