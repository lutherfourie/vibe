/**
 * Vibe v0 validators — Task 15: name policy.
 *
 * Concerns:
 *
 *   - Duplicate declaration names within a project. Two `agent foo` blocks
 *     (or two `provider x.y`, two `route resolver -> ...`, etc.) leave the
 *     runtime with two competing definitions for the same logical handle,
 *     so we surface a diagnostic on every offending node.
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
}

/**
 * Register all Vibe validation checks against the AST node types they
 * inspect. Called from `createVibeServices` after the container is built.
 */
export function registerValidationChecks(services: LangiumServices): void {
  const registry = services.validation.ValidationRegistry;
  const validator = new VibeValidator();
  const checks: ValidationChecks<VibeAstType> = {
    Project: validator.checkDuplicateDeclarations.bind(validator),
  };
  registry.register(checks, validator);
}
