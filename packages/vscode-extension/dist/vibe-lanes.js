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
exports.laneTreeItemsFromSelfPlan = laneTreeItemsFromSelfPlan;
exports.readVibeLaneTreeItems = readVibeLaneTreeItems;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
function laneTreeItemsFromSelfPlan(plan) {
    return (plan.lanes ?? []).map((lane) => ({
        id: lane.name,
        label: lane.name,
        description: lane.target,
        detail: lane.emits,
        target: lane.target,
        reads: lane.reads ?? [],
        owns: lane.owns,
        verify: lane.verify ?? [],
        approval: lane.approval,
    }));
}
async function readVibeLaneTreeItems(workspaceRoot) {
    const selfPlanPath = path.join(workspaceRoot, "docs", "examples", "vibe-self-plan.json");
    const raw = await fs.readFile(selfPlanPath, "utf8");
    return laneTreeItemsFromSelfPlan(JSON.parse(raw));
}
//# sourceMappingURL=vibe-lanes.js.map