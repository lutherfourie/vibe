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
exports.VibeLaneTreeDataProvider = void 0;
const vscode = __importStar(require("vscode"));
const vibe_lanes_js_1 = require("./vibe-lanes.js");
class VibeLaneTreeDataProvider {
    getWorkspaceRoot;
    didChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this.didChangeTreeData.event;
    constructor(getWorkspaceRoot) {
        this.getWorkspaceRoot = getWorkspaceRoot;
    }
    refresh() {
        this.didChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        if (element.kind === "lane") {
            const item = new vscode.TreeItem(element.lane.label, vscode.TreeItemCollapsibleState.Collapsed);
            item.id = element.lane.id;
            item.description = element.lane.description;
            item.tooltip = element.lane.detail;
            item.contextValue = "vibeLane";
            return item;
        }
        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
        item.description = element.value;
        item.tooltip = element.value;
        return item;
    }
    async getChildren(element) {
        if (element?.kind === "lane") {
            return laneDetails(element.lane);
        }
        if (element)
            return [];
        const workspaceRoot = this.getWorkspaceRoot();
        if (!workspaceRoot)
            return [];
        return (await (0, vibe_lanes_js_1.readVibeLaneTreeItems)(workspaceRoot)).map((lane) => ({
            kind: "lane",
            lane,
        }));
    }
}
exports.VibeLaneTreeDataProvider = VibeLaneTreeDataProvider;
function laneDetails(lane) {
    const details = [];
    if (lane.target) {
        details.push({ kind: "detail", label: "target", value: lane.target });
    }
    if (lane.owns) {
        details.push({ kind: "detail", label: "owns", value: lane.owns });
    }
    if (lane.reads.length > 0) {
        details.push({ kind: "detail", label: "reads", value: lane.reads.join(", ") });
    }
    if (lane.verify.length > 0) {
        details.push({
            kind: "detail",
            label: "verify",
            value: lane.verify.join(" && "),
        });
    }
    if (lane.approval) {
        details.push({ kind: "detail", label: "approval", value: lane.approval });
    }
    return details;
}
//# sourceMappingURL=vibe-lane-tree.js.map