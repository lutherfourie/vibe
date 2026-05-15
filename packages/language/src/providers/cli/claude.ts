import { createCliProvider } from "./base.js";
import type { ProviderAdapter } from "../types.js";

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
