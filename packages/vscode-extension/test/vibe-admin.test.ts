import { describe, expect, it } from "vitest";
import * as path from "node:path";
import {
  findVibeAdminAction,
  terminalCommandForAction,
  VIBE_ADMIN_ACTIONS,
} from "../src/vibe-admin.js";

describe("Vibe VS Code admin actions", () => {
  it("exposes the workspace commands needed by Codex and Claude", () => {
    expect(VIBE_ADMIN_ACTIONS.map((action) => action.id)).toEqual([
      "repo-snapshot",
      "lane-inventory",
      "cli-lanes",
      "lane-graph",
      "local-admin-host",
      "self-plan-check",
      "regenerate-self-plan",
      "full-check",
    ]);
  });

  it("builds a PowerShell command for workbench scripts", () => {
    const action = findVibeAdminAction("lane-inventory");
    const scriptPath = path.join(
      "C:\\vibe",
      "plugins",
      "vibe-workbench",
      "scripts",
      "vibe_lane_inventory.ps1",
    );

    expect(terminalCommandForAction(action, "C:\\vibe")).toBe(
      `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`,
    );
  });

  it("preserves shell commands that already run from the workspace root", () => {
    const action = findVibeAdminAction("full-check");

    expect(terminalCommandForAction(action, "C:\\vibe")).toBe("pnpm run check");
  });
});
