import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { extractSelfPlanFromSource } from "@vibe/language";
import {
  agentsPreviewMarkdown,
  gamespreeProjectTemplate,
  gamespreeState,
  genericProjectTemplate,
  genericState,
  notesTemplate,
  projectSummaryMarkdown,
  readVibeProjectState,
  type VibeSelfPlan,
} from "./vibe-project.js";

export type VibeProjectKind = "generic" | "gamespree";

export async function createVibeProjectFiles(
  workspaceRoot: string,
  kind: VibeProjectKind,
): Promise<string[]> {
  const projectName = kind === "gamespree" ? "GameSpree" : path.basename(workspaceRoot);
  const vibeDir = path.join(workspaceRoot, ".vibe");
  await fs.mkdir(vibeDir, { recursive: true });

  const projectPath = path.join(vibeDir, "project.vibe");
  const statePath = path.join(vibeDir, "state.json");
  const notesPath = path.join(vibeDir, "notes.md");
  const state =
    kind === "gamespree"
      ? gamespreeState(workspaceRoot)
      : genericState(projectName, workspaceRoot);

  const written: string[] = [];
  await writeIfMissing(
    projectPath,
    kind === "gamespree" ? gamespreeProjectTemplate() : genericProjectTemplate(projectName),
    written,
  );
  await writeIfMissing(statePath, `${JSON.stringify(state, null, 2)}\n`, written);
  await writeIfMissing(notesPath, notesTemplate(projectName), written);
  return written;
}

export async function parseVibeFileToState(
  workspaceRoot: string,
  filePath: string,
  source: string,
): Promise<VibeSelfPlan> {
  const state = await extractSelfPlanFromSource(source, {
    sourceName: toPortablePath(path.relative(workspaceRoot, filePath)),
    uri: pathToFileURL(filePath).href,
    name: path.basename(workspaceRoot),
  });
  await fs.mkdir(path.join(workspaceRoot, ".vibe"), { recursive: true });
  await fs.writeFile(
    path.join(workspaceRoot, ".vibe", "state.json"),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8",
  );
  return state;
}

export async function buildAgentsPreview(workspaceRoot: string): Promise<string> {
  const state = await readVibeProjectState(workspaceRoot);
  const outDir = path.join(workspaceRoot, ".vibe", "generated");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "AGENTS.preview.md");
  await fs.writeFile(outPath, agentsPreviewMarkdown(state), "utf8");
  return outPath;
}

export async function projectSummary(workspaceRoot: string): Promise<string> {
  return projectSummaryMarkdown(await readVibeProjectState(workspaceRoot));
}

async function writeIfMissing(
  filePath: string,
  content: string,
  written: string[],
): Promise<void> {
  try {
    await fs.writeFile(filePath, content, { encoding: "utf8", flag: "wx" });
    written.push(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

function toPortablePath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}
