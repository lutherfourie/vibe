import { execa } from "execa";
export function createCliProvider(opts) {
    if (!opts.binary) {
        throw new Error("CLI provider: binary path is required.");
    }
    return {
        id: opts.id,
        mode: "cli",
        async generateObject(req) {
            const payload = JSON.stringify({
                messages: req.messages,
                temperature: req.temperature,
                maxOutputTokens: req.maxOutputTokens,
                // The CLI is expected to know the schema by name; we hand it the
                // request envelope and trust the protocol.
            });
            const result = await execa(opts.binary, opts.args ?? [], {
                input: payload,
                timeout: opts.timeoutMs ?? 60_000,
                stripFinalNewline: true,
            });
            // CLI emits one JSON line on stdout. Parse it as the response value.
            let value;
            try {
                value = JSON.parse(result.stdout);
            }
            catch (err) {
                throw new Error(`CLI provider \`${opts.id}\` returned non-JSON stdout: ${result.stdout.slice(0, 200)}`);
            }
            return { value };
        },
    };
}
//# sourceMappingURL=base.js.map