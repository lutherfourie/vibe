"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectTreeItemsFromSelfPlan = projectTreeItemsFromSelfPlan;
exports.readVibeProjectState = readVibeProjectState;
exports.projectSummaryMarkdown = projectSummaryMarkdown;
exports.agentsPreviewMarkdown = agentsPreviewMarkdown;
exports.genericProjectTemplate = genericProjectTemplate;
exports.genericState = genericState;
exports.gamespreeProjectTemplate = gamespreeProjectTemplate;
exports.gamespreeState = gamespreeState;
exports.notesTemplate = notesTemplate;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
function projectTreeItemsFromSelfPlan(plan) {
    const routes = Object.entries(plan.routes ?? {});
    const lanes = plan.lanes ?? [];
    const gates = plan.gates ?? [];
    const agents = plan.agents ?? [];
    const surfaces = plan.surfaces ?? [];
    const notes = plan.notes ?? [];
    return [
        section("Project", [
            item("Name", plan.name),
            item("Source", plan.source ?? "unknown"),
            item("Repo", plan.repo ?? "unknown"),
            item("Fallback", plan.fallback ?? "none"),
        ]),
        section("Agents", agents.map((agent) => item(agent.name, agent.persona ?? agent.harness ?? "", agent.uses?.join(", ")))),
        section("Routes", routes.map(([name, target]) => item(name, target))),
        section("Lanes", lanes.map((lane) => item(lane.name, lane.target ?? lane.owns ?? "", lane.emits ?? lane.verify?.join(" && ")))),
        section("Gates", gates.map((gate) => item(gate.name, gate.owns ?? "", gate.emits))),
        section("Plugins", [...lanes, ...gates].map((plugin) => item(plugin.name, plugin.owns ?? "", plugin.emits))),
        section("Memory", [
            item("Namespace", plan.repo ?? "unknown"),
            item("Surfaces", surfaces.map((surface) => surface.name).join(", ") || "none"),
        ]),
        section("Problems", notes.length > 0
            ? notes.map((note, index) => item(`Note ${index + 1}`, note))
            : [item("Missing", "real lane syntax, real gate syntax")]),
    ];
}
async function readVibeProjectState(workspaceRoot) {
    for (const candidate of [
        path.join(workspaceRoot, ".vibe", "state.json"),
        path.join(workspaceRoot, "docs", "examples", "vibe-self-plan.json"),
    ]) {
        try {
            const raw = await fs.readFile(candidate, "utf8");
            return JSON.parse(raw);
        }
        catch (error) {
            if (error.code !== "ENOENT") {
                throw error;
            }
        }
    }
    return {
        name: path.basename(workspaceRoot),
        repo: workspaceRoot,
        routes: {},
        lanes: [],
        gates: [],
        agents: [],
        notes: ["No .vibe/state.json or docs/examples/vibe-self-plan.json found."],
    };
}
function projectSummaryMarkdown(plan) {
    return [
        `# ${plan.name}`,
        "",
        `- Source: ${plan.source ?? "unknown"}`,
        `- Repo: ${plan.repo ?? "unknown"}`,
        `- Fallback: ${plan.fallback ?? "none"}`,
        "",
        "## Routes",
        ...Object.entries(plan.routes ?? {}).map(([name, target]) => `- ${name}: ${target}`),
        "",
        "## Agents",
        ...(plan.agents ?? []).map((agent) => `- ${agent.name}: ${(agent.uses ?? []).join(", ")}`),
        "",
        "## Lanes",
        ...(plan.lanes ?? []).map((lane) => `- ${lane.name}: ${lane.owns ?? lane.target ?? "unscoped"}`),
        "",
        "## Gates",
        ...(plan.gates ?? []).map((gate) => `- ${gate.name}: ${gate.emits ?? gate.owns ?? ""}`),
        "",
    ].join("\n");
}
function agentsPreviewMarkdown(plan) {
    const lanes = plan.lanes ?? [];
    const gates = plan.gates ?? [];
    return [
        `# ${plan.name} Agent Contract Preview`,
        "",
        "This file is generated by the Vibe VS Code extension as a preview. Review it before copying any content into AGENTS.md or CLAUDE.md.",
        "",
        "## Routes",
        ...Object.entries(plan.routes ?? {}).map(([name, target]) => `- ${name}: ${target}`),
        "",
        "## Agent Lanes",
        ...lanes.map((lane) => [
            `### ${lane.name}`,
            "",
            `- Target: ${lane.target ?? "local human/agent"}`,
            `- Owns: ${lane.owns ?? "unspecified"}`,
            `- Reads: ${(lane.reads ?? []).join(", ") || "unspecified"}`,
            `- Verify: ${(lane.verify ?? []).join(" && ") || "unspecified"}`,
            `- Approval: ${lane.approval ?? "human review expected"}`,
            "",
        ].join("\n")),
        "## Gates",
        ...gates.map((gate) => `- ${gate.name}: ${gate.emits ?? gate.owns ?? ""}`),
        "",
    ].join("\n");
}
function genericProjectTemplate(projectName) {
    const safeName = toVibeId(projectName);
    return `provider openai.codex { mode = cli }
provider anthropic.claude_code { mode = cli }

route implementation -> openai.codex
route reviewer       -> anthropic.claude_code
fallback             -> openai.codex

memory ${safeName}_project {
  kind      = vault
  namespace = "${projectName}"
}

persona ${safeName}_guardian {
  description = "keeps the repo contract explicit; asks for human approval before broad or destructive changes"
}

plugin local_context_lane {
  impl  = "./tools/local-context-lane"
  owns  = "docs/** .vibe/**"
  emits = "repo truths, active lanes, gates, and handoff notes"
}

plugin human_merge_gate {
  impl  = "./tools/human-merge-gate"
  owns  = "review"
  emits = "approved merge decision"
}

harness repo_cockpit {
  kind = planner_generator_evaluator
}

agent ${safeName}_operator {
  persona = persona.${safeName}_guardian
  memory  = memory.${safeName}_project
  harness = harness.repo_cockpit
  uses    = [
    plugin.local_context_lane,
    plugin.human_merge_gate
  ]
}
`;
}
function genericState(projectName, workspaceRoot) {
    const safeName = toVibeId(projectName);
    return {
        name: projectName,
        source: ".vibe/project.vibe",
        repo: workspaceRoot,
        routes: {
            implementation: "openai.codex",
            reviewer: "anthropic.claude_code",
        },
        fallback: "openai.codex",
        agents: [
            {
                name: `${safeName}_operator`,
                persona: `persona.${safeName}_guardian`,
                memory: `memory.${safeName}_project`,
                harness: "harness.repo_cockpit",
                uses: ["plugin.local_context_lane", "plugin.human_merge_gate"],
            },
        ],
        lanes: [
            {
                name: "local_context_lane",
                owns: "docs/** .vibe/**",
                emits: "repo truths, active lanes, gates, and handoff notes",
            },
        ],
        gates: [
            {
                name: "human_merge_gate",
                owns: "review",
                emits: "approved merge decision",
            },
        ],
        notes: [
            "Generated by Vibe Now. Replace placeholders as the repo contract hardens.",
        ],
    };
}
function gamespreeProjectTemplate() {
    return `provider openai.gpt_5_5 { mode = api model = "gpt-5.5" }
provider openai.codex { mode = cli }
provider anthropic.claude_code { mode = cli }

route resolver       -> openai.gpt_5_5
route researcher     -> openai.gpt_5_5
route implementation -> openai.codex
route reviewer       -> anthropic.claude_code
fallback             -> openai.gpt_5_5

memory gamespree_project {
  kind      = vault
  namespace = "Vibecadex/gamespree"
}

persona gamespree_guardian {
  description = "protects Cat Cafe/Pawfall design spine; rejects speculative shared code; insists on playable Unity/WebGL checks"
}

plugin pawfall_truths {
  impl  = "./tools/pawfall-truths"
  owns  = "cat-cafe/games/pawfall/docs/**"
  emits = "binding product, design, platform, and tuning constraints"
}

plugin pawfall_feel_lane {
  impl  = "./tools/pawfall-feel-lane"
  owns  = "cat-cafe/games/pawfall/src/Assets/_Pawfall/Scripts/Player/** cat-cafe/games/pawfall/src/Assets/_Pawfall/Scripts/Cat/**"
  emits = "swipe feel, cat reactions, camera juice, tuning notes"
}

plugin webgl_deploy_lane {
  impl  = "./tools/webgl-deploy-lane"
  owns  = "cat-cafe/games/pawfall/build/** cat-cafe/games/pawfall/docs/**"
  emits = "desktop WebGL build notes and deploy readiness"
}

plugin telemetry_tuning_lane {
  impl  = "./tools/telemetry-tuning-lane"
  owns  = "cat-cafe/games/pawfall/qa/** cat-cafe/games/pawfall/docs/**"
  emits = "feel telemetry, tuning decisions, and QA evidence"
}

plugin asset_provenance_lane {
  impl  = "./tools/asset-provenance-lane"
  owns  = "cat-cafe/games/pawfall/asset-registry/** cat-cafe/games/pawfall/qa/proposed_assets/**"
  emits = "asset lineage, approvals, and registry health"
}

plugin human_merge_gate {
  impl  = "./tools/human-merge-gate"
  owns  = "review"
  emits = "approved merge decision"
}

harness repo_cockpit {
  kind = planner_generator_evaluator
}

agent gamespree_operator {
  persona = persona.gamespree_guardian
  memory  = memory.gamespree_project
  harness = harness.repo_cockpit
  uses    = [
    plugin.pawfall_truths,
    plugin.pawfall_feel_lane,
    plugin.webgl_deploy_lane,
    plugin.telemetry_tuning_lane,
    plugin.asset_provenance_lane,
    plugin.human_merge_gate
  ]
}
`;
}
function gamespreeState(workspaceRoot) {
    return {
        name: "GameSpree",
        source: ".vibe/project.vibe",
        repo: workspaceRoot,
        routes: {
            resolver: "openai.gpt_5_5",
            researcher: "openai.gpt_5_5",
            implementation: "openai.codex",
            reviewer: "anthropic.claude_code",
        },
        fallback: "openai.gpt_5_5",
        agents: [
            {
                name: "gamespree_operator",
                persona: "persona.gamespree_guardian",
                memory: "memory.gamespree_project",
                harness: "harness.repo_cockpit",
                uses: [
                    "plugin.pawfall_truths",
                    "plugin.pawfall_feel_lane",
                    "plugin.webgl_deploy_lane",
                    "plugin.telemetry_tuning_lane",
                    "plugin.asset_provenance_lane",
                    "plugin.human_merge_gate",
                ],
            },
        ],
        lanes: [
            {
                name: "pawfall_truths",
                owns: "cat-cafe/games/pawfall/docs/**",
                emits: "binding product, design, platform, and tuning constraints",
            },
            {
                name: "pawfall_feel_lane",
                owns: "cat-cafe/games/pawfall/src/Assets/_Pawfall/Scripts/Player/** cat-cafe/games/pawfall/src/Assets/_Pawfall/Scripts/Cat/**",
                emits: "swipe feel, cat reactions, camera juice, tuning notes",
            },
            {
                name: "webgl_deploy_lane",
                owns: "cat-cafe/games/pawfall/build/** cat-cafe/games/pawfall/docs/**",
                emits: "desktop WebGL build notes and deploy readiness",
            },
            {
                name: "telemetry_tuning_lane",
                owns: "cat-cafe/games/pawfall/qa/** cat-cafe/games/pawfall/docs/**",
                emits: "feel telemetry, tuning decisions, and QA evidence",
            },
            {
                name: "asset_provenance_lane",
                owns: "cat-cafe/games/pawfall/asset-registry/** cat-cafe/games/pawfall/qa/proposed_assets/**",
                emits: "asset lineage, approvals, and registry health",
            },
        ],
        gates: [
            { name: "unity_build", emits: "Unity compile/import passes" },
            { name: "webgl_smoke", emits: "desktop WebGL smoke test passes" },
            { name: "tutorial_render_check", emits: "tutorial UI renders correctly" },
            { name: "human_merge_approval", emits: "approved merge decision" },
        ],
        notes: [
            "Binding truths: portrait-only, desktop-WebGL-supported, mobile-validation-pending, no-runtime-LLM-gameplay, cat-on-every-screen.",
            "Generated by Vibe Now as an opinionated starter contract for GameSpree/Pawfall.",
        ],
    };
}
function notesTemplate(projectName) {
    return `# ${projectName} Vibe Notes

## Working Truths

- Keep repo truths visible before agent work starts.
- Keep lane ownership explicit.
- Treat merge approval as a gate.

## Open Questions

- Which lanes are active now?
- Which generated outputs should become committed source?
- Which checks prove the project is safe to merge?
`;
}
function section(label, children) {
    return {
        id: `section:${label}`,
        label,
        description: `${children.length}`,
        children,
    };
}
function item(label, description = "", detail) {
    return {
        id: `${label}:${description}`,
        label,
        description,
        detail,
    };
}
function toVibeId(value) {
    const id = value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    return id || "vibe_project";
}
//# sourceMappingURL=vibe-project.js.map