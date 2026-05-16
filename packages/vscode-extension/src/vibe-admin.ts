import * as path from "node:path";

export type VibeAdminAction =
  | {
      id: string;
      label: string;
      detail: string;
      kind: "script";
      script: string[];
      args?: string[];
    }
  | {
      id: string;
      label: string;
      detail: string;
      kind: "shell";
      command: string;
    };

export const VIBE_ADMIN_ACTIONS: VibeAdminAction[] = [
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

export function findVibeAdminAction(id: string): VibeAdminAction {
  const action = VIBE_ADMIN_ACTIONS.find((candidate) => candidate.id === id);
  if (!action) {
    throw new Error(`Unknown Vibe admin action: ${id}`);
  }

  return action;
}

export function terminalCommandForAction(
  action: VibeAdminAction,
  workspaceRoot: string,
): string {
  if (action.kind === "shell") {
    return action.command;
  }

  const scriptPath = path.join(workspaceRoot, ...action.script);
  const args = action.args?.length ? ` ${action.args.join(" ")}` : "";
  return `powershell -ExecutionPolicy Bypass -File ${quotePowerShellArg(scriptPath)}${args}`;
}

function quotePowerShellArg(value: string): string {
  return `"${value.replace(/`/g, "``").replace(/"/g, '`"')}"`;
}
