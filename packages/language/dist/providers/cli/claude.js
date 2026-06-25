import { createCliProvider } from "./base.js";
export function createClaudeCliProvider(opts) {
    return createCliProvider({
        id: opts.id ?? "anthropic.claude_code",
        binary: opts.binary,
        args: opts.args ?? ["--protocol", "claude-cli-jsonline-v1"],
        lifecycle: "short-lived",
    });
}
//# sourceMappingURL=claude.js.map