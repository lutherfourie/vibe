/**
 * Vibe v0 validators — Task 15: name policy. Task 16: reserved route name.
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
    ],
  };
  registry.register(checks, validator);
}
