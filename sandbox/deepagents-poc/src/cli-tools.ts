import { execa } from "execa";
import { tool } from "langchain";
import { z } from "zod";

const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes — CLI agent loops can be slow

interface CliRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
}

async function runCli(
  cmd: string,
  args: string[],
  cwd: string,
  stdin: string | undefined,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<CliRunResult> {
  const start = Date.now();
  const result = await execa(cmd, args, {
    cwd,
    timeout: timeoutMs,
    reject: false,
    windowsHide: true,
    input: stdin,
  });
  return {
    ok: result.exitCode === 0 && !result.timedOut,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.exitCode ?? -1,
    durationMs: Date.now() - start,
    timedOut: result.timedOut ?? false,
  };
}

/**
 * invoke_codex_cli — delegate a task to the local Codex CLI.
 *
 * Uses `codex exec --sandbox read-only` so Codex cannot write files. The CLI
 * still has its own model + tools; we only consume its text response.
 */
export const invokeCodexCli = tool(
  async (input: { prompt: string; cwd?: string }) => {
    const cwd = input.cwd ?? process.cwd();
    // Pipe prompt via stdin (using `-` to instruct Codex to read from stdin).
    // Avoids Windows argv-with-newlines truncation; survives any prompt size.
    const result = await runCli(
      "codex",
      ["exec", "--sandbox", "read-only", "-"],
      cwd,
      input.prompt,
    );
    if (!result.ok) {
      const reason = result.timedOut
        ? `timed out after ${result.durationMs}ms`
        : `exit=${result.exitCode}`;
      return `[codex exec failed ${reason}]\nstderr:\n${result.stderr.slice(-2000)}\nstdout:\n${result.stdout.slice(-2000)}`;
    }
    return `[codex exec ok duration=${result.durationMs}ms]\n${result.stdout}`;
  },
  {
    name: "invoke_codex_cli",
    description:
      "Delegate a task to the local Codex CLI in a read-only sandbox. Returns Codex's text response. Use for fast, broad analysis or substantive code-aware reasoning. Pass the full task as `prompt`; the CLI cannot read files unless you include their content in the prompt.",
    schema: z.object({
      prompt: z.string().min(1).describe("The task / prompt to send to Codex."),
      cwd: z
        .string()
        .optional()
        .describe(
          "Working directory for Codex. Defaults to the current process cwd.",
        ),
    }),
  },
);

/**
 * invoke_claude_cli — delegate a task to the local Claude Code CLI.
 *
 * Uses `claude -p` (print mode, non-interactive) with text output. Claude
 * defaults to its built-in tools; we only consume its final text answer.
 */
export const invokeClaudeCli = tool(
  async (input: { prompt: string; cwd?: string }) => {
    const cwd = input.cwd ?? process.cwd();
    // Pipe prompt via stdin instead of argv to avoid Windows newline truncation.
    // With -p and no positional prompt, Claude reads from stdin.
    const result = await runCli(
      "claude",
      ["-p", "--input-format", "text", "--output-format", "text"],
      cwd,
      input.prompt,
    );
    if (!result.ok) {
      const reason = result.timedOut
        ? `timed out after ${result.durationMs}ms`
        : `exit=${result.exitCode}`;
      return `[claude -p failed ${reason}]\nstderr:\n${result.stderr.slice(-2000)}\nstdout:\n${result.stdout.slice(-2000)}`;
    }
    return `[claude -p ok duration=${result.durationMs}ms]\n${result.stdout}`;
  },
  {
    name: "invoke_claude_cli",
    description:
      "Delegate a task to the local Claude Code CLI (non-interactive print mode). Returns Claude's text response. Use for careful critique, code review, or reasoning that benefits from Claude's strengths. Pass the full task as `prompt`; include any file content inline since the CLI works on a separate filesystem namespace.",
    schema: z.object({
      prompt: z.string().min(1).describe("The task / prompt to send to Claude."),
      cwd: z
        .string()
        .optional()
        .describe(
          "Working directory for Claude. Defaults to the current process cwd.",
        ),
    }),
  },
);
