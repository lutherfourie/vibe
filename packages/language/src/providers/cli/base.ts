import { execa } from "execa";
import type {
  GenerateObjectRequest,
  GenerateObjectResponse,
  ProviderAdapter,
} from "../types.js";

export interface CliProviderOptions {
  id: string;
  binary: string;
  /** Extra args to prepend to every invocation. */
  args?: string[];
  /** Lifecycle policy. v0 ships short-lived only. */
  lifecycle?: "short-lived";
  /** Timeout per call in milliseconds. */
  timeoutMs?: number;
}

export function createCliProvider(opts: CliProviderOptions): ProviderAdapter {
  if (!opts.binary) {
    throw new Error("CLI provider: binary path is required.");
  }
  return {
    id: opts.id,
    mode: "cli",
    async generateObject<T>(req: GenerateObjectRequest): Promise<GenerateObjectResponse<T>> {
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
      let value: T;
      try {
        value = JSON.parse(result.stdout) as T;
      } catch (err) {
        throw new Error(
          `CLI provider \`${opts.id}\` returned non-JSON stdout: ${result.stdout.slice(0, 200)}`,
        );
      }
      return { value };
    },
  };
}
