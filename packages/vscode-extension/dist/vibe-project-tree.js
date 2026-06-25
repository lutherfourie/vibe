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
exports.VibeProjectTreeDataProvider = void 0;
const vscode = __importStar(require("vscode"));
const vibe_project_js_1 = require("./vibe-project.js");
class VibeProjectTreeDataProvider {
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
        const item = new vscode.TreeItem(element.label, element.children?.length
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None);
        item.id = element.id;
        item.description = element.description;
        item.tooltip = element.detail ?? element.description;
        item.contextValue = element.children?.length ? "vibeSection" : "vibeItem";
        return item;
    }
    async getChildren(element) {
        if (element)
            return element.children ?? [];
        const workspaceRoot = this.getWorkspaceRoot();
        if (!workspaceRoot)
            return [];
        return (0, vibe_project_js_1.projectTreeItemsFromSelfPlan)(await (0, vibe_project_js_1.readVibeProjectState)(workspaceRoot));
    }
}
exports.VibeProjectTreeDataProvider = VibeProjectTreeDataProvider;
//# sourceMappingURL=vibe-project-tree.js.map