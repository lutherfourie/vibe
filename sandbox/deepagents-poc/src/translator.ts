/**
 * Vibe lane → deepagents translator (POC).
 *
 * Takes a JSON lane spec (matching the Vibe lane shape, with a system-prompt
 * file reference) and returns a configured `createDeepAgent` instance.
 *
 * This is the Phase-2 deliverable. It encapsulates the integration findings
 * from Phase 1 (virtual /-prefixed paths, virtualMode=true) and Phase 1.5
 * (CLI tools via stdin) so that lane authors don't have to re-discover them.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createDeepAgent, FilesystemBackend } from "deepagents";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Tool } from "@langchain/core/tools";
import { createCerebrasModel } from "./cerebras-model.js";
import { invokeCodexCli, invokeClaudeCli } from "./cli-tools.js";

/**
 * Vibe lane shape consumed by the translator.
 *
 * Aligns with the parsed-`.vibe` lane shape from
 * `packages/vscode-extension/src/vibe-project.ts`, plus three additional
 * fields the translator needs (prompt[File], defaultUserMessage, tools).
 */
export interface VibeLaneSpec {
  /** Lane identifier — used for logging and (later) profile registration. */
  name: string;
  description?: string;

  /** System prompt; either inline or via a file path resolved relative to the JSON spec. */
  prompt?: string;
  promptFile?: string;

  /** Convenient default user message; overridable via CLI arg at runtime. */
  defaultUserMessage?: string;

  /** Paths the lane is allowed to read (virtual /-prefixed or relative — both normalized). */
  reads?: string[];

  /** Paths the lane is allowed to write. */
  owns?: string[];

  /** External-surface tools to include. */
  tools?: ("codex_cli" | "claude_cli")[];

  /** Model selection. Only "cerebras" supported in this POC. */
  model?: "cerebras";

  /** Backend root directory; defaults to process.cwd(). */
  rootDir?: string;

  // Documented-but-not-yet-enforced Vibe lane metadata:

  /** Verify commands the lane is expected to satisfy (Phase 3 wiring). */
  verify?: string[];

  /** Human approval gate (Phase 3 wiring). */
  approval?: string;

  /** Target surface hint (e.g. "codex.local"). */
  target?: string;
}

export interface TranslateOptions {
  /** Override the model. */
  model?: BaseChatModel;

  /** Provide additional tools by name. Falls back to built-in registry. */
  toolsByName?: Record<string, Tool>;

  /** Directory containing the lane JSON, used to resolve promptFile. */
  specDir?: string;
}

const BUILTIN_TOOLS: Record<string, Tool> = {
  codex_cli: invokeCodexCli as unknown as Tool,
  claude_cli: invokeClaudeCli as unknown as Tool,
};

function virtualize(p: string): string {
  let v = p.replace(/\\/g, "/").trim();
  if (!v) return v;
  if (!v.startsWith("/")) v = "/" + v;
  return v;
}

async function resolveSystemPrompt(
  spec: VibeLaneSpec,
  specDir: string,
): Promise<string> {
  if (spec.prompt) return spec.prompt;
  if (spec.promptFile) {
    const resolved = path.isAbsolute(spec.promptFile)
      ? spec.promptFile
      : path.join(specDir, spec.promptFile);
    return readFile(resolved, "utf8");
  }
  throw new Error(
    `Lane "${spec.name}" has neither prompt nor promptFile.`,
  );
}

function resolveTools(
  spec: VibeLaneSpec,
  override?: Record<string, Tool>,
): Tool[] {
  const registry = override ?? BUILTIN_TOOLS;
  const tools: Tool[] = [];
  for (const name of spec.tools ?? []) {
    const t = registry[name];
    if (!t) throw new Error(`Lane "${spec.name}" requests unknown tool "${name}".`);
    tools.push(t);
  }
  return tools;
}

function buildPermissions(spec: VibeLaneSpec) {
  const perms: Array<{
    operations: ("read" | "write")[];
    paths: string[];
    mode: "allow" | "deny";
  }> = [];

  for (const r of spec.reads ?? []) {
    perms.push({ operations: ["read"], paths: [virtualize(r)], mode: "allow" });
  }
  for (const w of spec.owns ?? []) {
    perms.push({ operations: ["write"], paths: [virtualize(w)], mode: "allow" });
  }
  // Catch-all deny last — order matters, allow rules above must take precedence.
  perms.push({
    operations: ["read", "write"],
    paths: ["/**"],
    mode: "deny",
  });

  return perms;
}

/**
 * Translate a Vibe lane spec into a configured deepagents instance.
 *
 * @param spec  The lane spec (typically loaded from JSON)
 * @param opts  Translation options (model override, tool registry, spec directory)
 */
export async function translateLane(
  spec: VibeLaneSpec,
  opts: TranslateOptions = {},
) {
  const specDir = opts.specDir ?? process.cwd();
  const systemPrompt = await resolveSystemPrompt(spec, specDir);
  const model = opts.model ?? createCerebrasModel();
  const tools = resolveTools(spec, opts.toolsByName);
  const permissions = buildPermissions(spec);

  return createDeepAgent({
    model,
    systemPrompt,
    tools,
    backend: new FilesystemBackend({
      rootDir: spec.rootDir ?? process.cwd(),
      virtualMode: true,
    }),
    permissions,
  });
}

/**
 * Load and translate a lane from a JSON file in one step.
 */
export async function loadAndTranslateLane(
  jsonPath: string,
  opts: Omit<TranslateOptions, "specDir"> = {},
) {
  const absolutePath = path.resolve(jsonPath);
  const raw = await readFile(absolutePath, "utf8");
  const spec = JSON.parse(raw) as VibeLaneSpec;
  return {
    spec,
    agent: await translateLane(spec, {
      ...opts,
      specDir: path.dirname(absolutePath),
    }),
  };
}
