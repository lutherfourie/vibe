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
/**
 * Stable lowercase label used in diagnostics. Matches the keyword each
 * primitive's grammar rule fires on, so the message reads naturally next to
 * the source ("Duplicate agent declaration: izsha").
 */
const KIND_LABEL = {
    Agent: "agent",
    Persona: "persona",
    Memory: "memory",
    Harness: "harness",
    Plugin: "plugin",
    Provider: "provider",
    Surface: "surface",
    Route: "route",
    AutonomousSession: "autonomous-session",
    Lane: "lane",
    Checkpoint: "checkpoint",
    SelfReview: "self-review",
    ResearchStep: "research-step",
    Tool: "tool",
    Eval: "eval",
    Template: "template",
    Policy: "policy",
    Workflow: "workflow",
    Character: "character",
    FrameReview: "frame-review",
    ConsistencyGuard: "consistency-guard",
    Rule: "rule",
    Director: "director",
};
function isNamedDeclaration(node) {
    const type = node?.$type;
    return (type === "Agent" ||
        type === "Persona" ||
        type === "Memory" ||
        type === "Harness" ||
        type === "Plugin" ||
        type === "Provider" ||
        type === "Surface" ||
        type === "Route" ||
        type === "AutonomousSession" ||
        type === "Lane" ||
        type === "Checkpoint" ||
        type === "SelfReview" ||
        type === "ResearchStep" ||
        type === "Tool" ||
        type === "Eval" ||
        type === "Template" ||
        type === "Policy" ||
        type === "Workflow" ||
        type === "Character" ||
        type === "FrameReview" ||
        type === "ConsistencyGuard" ||
        type === "Rule" ||
        type === "Director");
}
/**
 * Project-keyed grammar handle. For `Provider` it's the dotted segments
 * joined by `.` (the qualified name as written); for `Route` it's the
 * `from` identifier (the route's logical handle); for the rest it's just
 * `name`. Returns `undefined` when the parser produced a partial AST node
 * with no name bound (parse error path) — those are skipped so the
 * validator doesn't pile on top of an existing parser diagnostic.
 */
function declarationKey(decl) {
    switch (decl.$type) {
        case "Provider":
        case "Surface":
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
function reportDuplicate(decl, message, accept) {
    if (decl.$type === "Route") {
        accept("error", message, { node: decl, property: "from" });
    }
    else {
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
    checkDuplicateDeclarations(project, accept) {
        const buckets = new Map();
        for (const decl of project.declarations) {
            if (!isNamedDeclaration(decl))
                continue;
            const key = declarationKey(decl);
            if (key === undefined || key === "")
                continue;
            const bucketKey = `${decl.$type}:${key}`;
            const bucket = buckets.get(bucketKey) ?? [];
            bucket.push(decl);
            buckets.set(bucketKey, bucket);
        }
        for (const bucket of buckets.values()) {
            if (bucket.length < 2)
                continue;
            const first = bucket[0];
            if (first === undefined)
                continue; // satisfies noUncheckedIndexedAccess
            const label = KIND_LABEL[first.$type];
            const name = declarationKey(first);
            if (name === undefined)
                continue;
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
    checkResolverRoute(project, accept) {
        let hasAgent = false;
        let hasRoute = false;
        let hasResolver = false;
        for (const decl of project.declarations) {
            if (decl.$type === "Agent") {
                hasAgent = true;
            }
            else if (decl.$type === "Route") {
                hasRoute = true;
                if (decl.from === "resolver") {
                    hasResolver = true;
                }
            }
        }
        if (!hasAgent && !hasRoute)
            return;
        if (hasResolver)
            return;
        accept("error", "Missing required route `resolver`. Every Vibe project must declare `route resolver -> <provider>`.", { node: project });
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
    checkCrossReferences(project, accept) {
        const declared = {
            agent: new Set(),
            route: new Set(),
            persona: new Set(),
            memory: new Set(),
            harness: new Set(),
            plugin: new Set(),
            provider: new Set(),
            surface: new Set(),
            trigger: new Set(),
            fallback: new Set(),
            "autonomous-session": new Set(),
            lane: new Set(),
            checkpoint: new Set(),
            "self-review": new Set(),
            "research-step": new Set(),
            tool: new Set(),
            eval: new Set(),
            template: new Set(),
            policy: new Set(),
            workflow: new Set(),
            character: new Set(),
            "frame-review": new Set(),
            "consistency-guard": new Set(),
            rule: new Set(),
            director: new Set(),
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
                case "Provider": {
                    // Defensive: a partially-parsed `provider { ... }` with no bound
                    // name leaves `decl.name` undefined. Mirror the `?.` guard used in
                    // declarationKey so the populator never NPEs on an error-recovery
                    // AST — the parser has already emitted its own diagnostic, and
                    // skipping here keeps the rest of the document's diagnostics alive.
                    const seg = decl.name?.segments;
                    if (seg)
                        declared.provider.add(seg.join("."));
                    break;
                }
                case "Surface": {
                    const seg = decl.name?.segments;
                    if (seg)
                        declared.surface.add(seg.join("."));
                    break;
                }
                case "AutonomousSession":
                    declared["autonomous-session"].add(decl.name);
                    break;
                case "Lane":
                    declared.lane.add(decl.name);
                    break;
                case "Checkpoint":
                    declared.checkpoint.add(decl.name);
                    break;
                case "SelfReview":
                    declared["self-review"].add(decl.name);
                    break;
                case "ResearchStep":
                    declared["research-step"].add(decl.name);
                    break;
                case "Tool":
                    declared.tool.add(decl.name);
                    break;
                case "Eval":
                    declared.eval.add(decl.name);
                    break;
                case "Template":
                    declared.template.add(decl.name);
                    break;
                case "Policy":
                    declared.policy.add(decl.name);
                    break;
                case "Workflow":
                    declared.workflow.add(decl.name);
                    break;
                case "Character":
                    declared.character.add(decl.name);
                    break;
                case "FrameReview":
                    declared["frame-review"].add(decl.name);
                    break;
                case "ConsistencyGuard":
                    declared["consistency-guard"].add(decl.name);
                    break;
                case "Rule":
                    declared.rule.add(decl.name);
                    break;
                case "Director":
                    declared.director.add(decl.name);
                    break;
                // Trigger and Fallback have no name slot; they're listed in
                // CROSS_REF_KINDS for completeness (the spec lists them as kind
                // keywords) but never accept references back to themselves at v0.
            }
        }
        const visit = (node) => {
            if (node === null || typeof node !== "object")
                return;
            const typed = node;
            if (typed.$type === "Reference") {
                const ref = node;
                // Defensive: error-recovery can produce a Reference node whose
                // `segments` array is undefined. Skip it rather than NPE on
                // `ref.segments[0]` — the parser already flagged the malformed input.
                if (!ref.segments)
                    return;
                const head = ref.segments[0];
                if (head !== undefined && isCrossRefKind(head) && ref.segments.length >= 2) {
                    // Provider and surface declared names are dotted, so references like
                    // `provider.cerebras.glm_4_7` and `surface.codex.local` must join all
                    // segments after the head for lookup. Plugin tool references stay flat
                    // (`plugin.<name>.<tool>`) — segments[2] is the runtime tool and is
                    // ignored at v0; only segments[1] (the plugin name) is validated.
                    const tail = head === "provider" || head === "surface"
                        ? ref.segments.slice(1).join(".")
                        : ref.segments[1];
                    if (tail !== undefined && !declared[head].has(tail)) {
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
                if (key.startsWith("$"))
                    continue;
                const value = node[key];
                if (Array.isArray(value)) {
                    for (const item of value)
                        visit(item);
                }
                else if (value !== null && typeof value === "object") {
                    visit(value);
                }
            }
        };
        visit(project);
    }
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
    checkCorrectedTarget(project, accept) {
        for (const decl of project.declarations) {
            if (decl.$type !== "Corrected")
                continue;
            const target = decl.target?.trim() ?? "";
            if (target.length === 0) {
                accept("error", "`corrected` target must not be empty.", {
                    node: decl,
                    property: "target",
                });
            }
        }
    }
}
/**
 * The declaration-kind keywords that the grammar treats as the head of
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
    "surface",
    "trigger",
    "fallback",
    "autonomous-session",
    "lane",
    "checkpoint",
    "self-review",
    "research-step",
    "tool",
    "eval",
    "template",
    "policy",
    "workflow",
    "character",
    "frame-review",
    "consistency-guard",
    "rule",
    "director",
];
function isCrossRefKind(value) {
    return CROSS_REF_KINDS.includes(value);
}
/**
 * Register all Vibe validation checks against the AST node types they
 * inspect. Called from `createVibeServices` after the container is built.
 */
export function registerValidationChecks(services) {
    const registry = services.validation.ValidationRegistry;
    const validator = new VibeValidator();
    const checks = {
        Project: [
            validator.checkDuplicateDeclarations.bind(validator),
            validator.checkResolverRoute.bind(validator),
            validator.checkCrossReferences.bind(validator),
            validator.checkCorrectedTarget.bind(validator),
        ],
    };
    registry.register(checks, validator);
}
//# sourceMappingURL=vibe-validator.js.map