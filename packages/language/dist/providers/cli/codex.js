import { createCliProvider } from "./base.js";
export function createCodexCliProvider(opts) {
    return createCliProvider({
        id: opts.id ?? "openai.codex",
        binary: opts.binary,
        args: opts.args ?? ["--protocol", "codex-cli-jsonline-v1"],
        lifecycle: "short-lived",
    });
}
//# sourceMappingURL=codex.js.map