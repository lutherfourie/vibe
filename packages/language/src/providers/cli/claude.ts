import { createCliProvider } from "./base.js";
import type { ProviderAdapter } from "../types.js";

// TEMPORARILY DISABLED for CLI use: the claude CLI binary is actively used by another local project.
// We must not spawn/interfere from Vibe code in this workspace.
// - Not auto-registered in providers/index.ts (only exported for completeness / future re-enable).
// - Do not call createClaudeCliProvider({binary: "claude", ...}) while disabled.
// - See .claude.disabled/, .vscode/extensions.json (claude-code commented), go serve registration disabled,
//   VIBE_DISABLE_CLAUDE_CLI env for Go side, and docs/local-toolkit.md.
// Re-enable registration + usage symmetrically with Go side when safe. Prefer codex/grok/cerebras in the meantime.
// Use of this in tests/fixtures that don't actually exec is ok (mocked).

export interface ClaudeCliOptions {
  binary: string;
  /** Optional id override; defaults to anthropic.claude_code. */
  id?: string;
  /** Optional extra args. */
  args?: string[];
}

export function createClaudeCliProvider(opts: ClaudeCliOptions): ProviderAdapter {
  return createCliProvider({
    id: opts.id ?? "anthropic.claude_code",
    binary: opts.binary,
    args: opts.args ?? ["--protocol", "claude-cli-jsonline-v1"],
    lifecycle: "short-lived",
  });
}
