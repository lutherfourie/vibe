import { createCliProvider } from "./base.js";
import type { ProviderAdapter } from "../types.js";

export interface CodexCliOptions {
  binary: string;
  /** Optional id override; defaults to openai.codex. */
  id?: string;
  /** Optional extra args. */
  args?: string[];
}

export function createCodexCliProvider(opts: CodexCliOptions): ProviderAdapter {
  return createCliProvider({
    id: opts.id ?? "openai.codex",
    binary: opts.binary,
    args: opts.args ?? ["--protocol", "codex-cli-jsonline-v1"],
    lifecycle: "short-lived",
  });
}
