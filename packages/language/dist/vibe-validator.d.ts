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
 *     segment is one of the declaration-kind keywords (`agent`,
 *     `route`, `persona`, `memory`, `harness`, `plugin`, `provider`, `surface`,
 *     `trigger`, `fallback`, `autonomous-session`, `lane`, `checkpoint`,
 *     `self-review`, `research-step`) must have its second segment match a declared
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
import type { ValidationAcceptor } from "langium";
import type { Project } from "./generated/ast.js";
import type { LangiumServices } from "langium/lsp";
export declare class VibeValidator {
    /**
     * Walk the project's declaration list once, bucket by (kind, key), and
     * emit a diagnostic on every member of any bucket with more than one
     * entry. Reporting on every offender (rather than just the second one)
     * gives IDE users a marker on each conflicting site, which matches how
     * Langium-built languages typically surface duplicate-symbol errors.
     */
    checkDuplicateDeclarations(project: Project, accept: ValidationAcceptor): void;
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
    checkResolverRoute(project: Project, accept: ValidationAcceptor): void;
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
    checkCrossReferences(project: Project, accept: ValidationAcceptor): void;
    /**
     * SD2 Task 8: `corrected for "<target>" { ... }` carries a feedback edit
     * that the resolver merges back into a specific resolver invocation
     * addressed by the target string. An empty or whitespace-only target has
     * no merge destination, so the block becomes dead text and is almost
     * certainly an authoring mistake (typo, deleted addressing key, paste
     * error). We surface a source-level error so the IDE underlines the empty
     * string instead of the runtime silently dropping the block.
     *
     * The diagnostic anchors on `{ node: decl, property: "target" }` so the
     * IDE marker underlines the (empty) target literal rather than the whole
     * `corrected { ... }` block — matching the per-property anchoring pattern
     * the other validators in this file already use.
     *
     * Whitespace-only targets (`"   "`) are treated as empty: a target made of
     * nothing but spaces can't be a valid addressing key in any future routing
     * scheme, and accepting it would defeat the purpose of the check.
     */
    checkCorrectedTarget(project: Project, accept: ValidationAcceptor): void;
}
/**
 * Register all Vibe validation checks against the AST node types they
 * inspect. Called from `createVibeServices` after the container is built.
 */
export declare function registerValidationChecks(services: LangiumServices): void;
//# sourceMappingURL=vibe-validator.d.ts.map