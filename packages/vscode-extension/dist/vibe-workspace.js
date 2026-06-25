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
exports.createVibeProjectFiles = createVibeProjectFiles;
exports.parseVibeFileToState = parseVibeFileToState;
exports.buildAgentsPreview = buildAgentsPreview;
exports.projectSummary = projectSummary;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const node_url_1 = require("node:url");
const vibe_project_js_1 = require("./vibe-project.js");
async function createVibeProjectFiles(workspaceRoot, kind) {
    const projectName = kind === "gamespree" ? "GameSpree" : path.basename(workspaceRoot);
    const vibeDir = path.join(workspaceRoot, ".vibe");
    await fs.mkdir(vibeDir, { recursive: true });
    const projectPath = path.join(vibeDir, "project.vibe");
    const statePath = path.join(vibeDir, "state.json");
    const notesPath = path.join(vibeDir, "notes.md");
    const state = kind === "gamespree"
        ? (0, vibe_project_js_1.gamespreeState)(workspaceRoot)
        : (0, vibe_project_js_1.genericState)(projectName, workspaceRoot);
    const written = [];
    await writeIfMissing(projectPath, kind === "gamespree" ? (0, vibe_project_js_1.gamespreeProjectTemplate)() : (0, vibe_project_js_1.genericProjectTemplate)(projectName), written);
    await writeIfMissing(statePath, `${JSON.stringify(state, null, 2)}\n`, written);
    await writeIfMissing(notesPath, (0, vibe_project_js_1.notesTemplate)(projectName), written);
    return written;
}
async function parseVibeFileToState(workspaceRoot, filePath, source) {
    const { extractSelfPlanFromSource } = await import("@vibe/language");
    const state = await extractSelfPlanFromSource(source, {
        sourceName: toPortablePath(path.relative(workspaceRoot, filePath)),
        uri: (0, node_url_1.pathToFileURL)(filePath).href,
        name: path.basename(workspaceRoot),
    });
    await fs.mkdir(path.join(workspaceRoot, ".vibe"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, ".vibe", "state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
    return state;
}
async function buildAgentsPreview(workspaceRoot) {
    const state = await (0, vibe_project_js_1.readVibeProjectState)(workspaceRoot);
    const outDir = path.join(workspaceRoot, ".vibe", "generated");
    await fs.mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, "AGENTS.preview.md");
    await fs.writeFile(outPath, (0, vibe_project_js_1.agentsPreviewMarkdown)(state), "utf8");
    return outPath;
}
async function projectSummary(workspaceRoot) {
    return (0, vibe_project_js_1.projectSummaryMarkdown)(await (0, vibe_project_js_1.readVibeProjectState)(workspaceRoot));
}
async function writeIfMissing(filePath, content, written) {
    try {
        await fs.writeFile(filePath, content, { encoding: "utf8", flag: "wx" });
        written.push(filePath);
    }
    catch (error) {
        if (error.code !== "EEXIST") {
            throw error;
        }
    }
}
function toPortablePath(filePath) {
    return filePath.replaceAll("\\", "/");
}
//# sourceMappingURL=vibe-workspace.js.map