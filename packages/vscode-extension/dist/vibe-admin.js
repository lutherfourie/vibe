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
exports.VIBE_ADMIN_ACTIONS = void 0;
exports.findVibeAdminAction = findVibeAdminAction;
exports.terminalCommandForAction = terminalCommandForAction;
const path = __importStar(require("node:path"));
exports.VIBE_ADMIN_ACTIONS = [
    {
        id: "repo-snapshot",
        label: "Vibe: Repo Snapshot",
        detail: "Report branch state, tools, self-plan freshness, and agent surfaces.",
        kind: "script",
        script: ["plugins", "vibe-workbench", "scripts", "vibe_repo_snapshot.ps1"],
    },
    {
        id: "lane-inventory",
        label: "Vibe: Lane Inventory",
        detail: "List Vibe lanes, targets, ownership, verification, and approvals.",
        kind: "script",
        script: ["plugins", "vibe-workbench", "scripts", "vibe_lane_inventory.ps1"],
    },
    {
        id: "cli-lanes",
        label: "Vibe: CLI Lanes",
        detail: "Print lanes from the unified Go CLI and self-plan JSON.",
        kind: "shell",
        command: "pnpm run vibe:lanes",
    },
    {
        id: "lane-graph",
        label: "Vibe: Generate Lane Graph",
        detail: "Generate docs/examples/vibe-lanes.mmd from the self-plan.",
        kind: "shell",
        command: "pnpm run vibe:graph",
    },
    {
        id: "local-admin-host",
        label: "Vibe: Local Admin Host",
        detail: "Serve the local Vibe admin dashboard on 127.0.0.1:8787.",
        kind: "shell",
        command: "pnpm run vibe:serve",
    },
    {
        id: "self-plan-check",
        label: "Vibe: Self-Plan Check",
        detail: "Check whether docs/examples/vibe-self-plan.json is fresh.",
        kind: "script",
        script: ["plugins", "vibe-workbench", "scripts", "vibe_self_plan_check.ps1"],
    },
    {
        id: "regenerate-self-plan",
        label: "Vibe: Regenerate Self-Plan",
        detail: "Regenerate the self-plan artifact from examples/vibe-self.vibe.",
        kind: "script",
        script: ["plugins", "vibe-workbench", "scripts", "vibe_self_plan_check.ps1"],
        args: ["-Regenerate"],
    },
    {
        id: "full-check",
        label: "Vibe: Full Check",
        detail: "Run the repo's self-plan, tests, and build checks.",
        kind: "shell",
        command: "pnpm run check",
    },
];
function findVibeAdminAction(id) {
    const action = exports.VIBE_ADMIN_ACTIONS.find((candidate) => candidate.id === id);
    if (!action) {
        throw new Error(`Unknown Vibe admin action: ${id}`);
    }
    return action;
}
function terminalCommandForAction(action, workspaceRoot) {
    if (action.kind === "shell") {
        return action.command;
    }
    const scriptPath = path.join(workspaceRoot, ...action.script);
    const args = action.args?.length ? ` ${action.args.join(" ")}` : "";
    return `powershell -ExecutionPolicy Bypass -File ${quotePowerShellArg(scriptPath)}${args}`;
}
function quotePowerShellArg(value) {
    return `"${value.replace(/`/g, "``").replace(/"/g, '`"')}"`;
}
//# sourceMappingURL=vibe-admin.js.map