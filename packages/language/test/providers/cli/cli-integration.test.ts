import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createCliProvider } from "../../../src/providers/cli/base.js";

const MOCK_BIN = fileURLToPath(new URL("./mock-binary.mjs", import.meta.url));

describe("CLI provider end-to-end with mock binary", () => {
  it("invokes the binary, sends JSON stdin, parses JSON stdout", async () => {
    const provider = createCliProvider({
      id: "mock.cli",
      binary: process.execPath, // node
      args: [MOCK_BIN],
    });
    const result = await provider.generateObject({
      messages: [{ role: "user", content: "ping" }],
      schema: {},
      temperature: 0.5,
    });
    expect(result.value).toEqual({ echo: "ping", role: "user", temperature: 0.5 });
  });

  it("throws when the binary returns non-JSON stdout", async () => {
    // Use a node one-liner that prints garbage.
    const provider = createCliProvider({
      id: "mock.cli.bad",
      binary: process.execPath,
      args: ["-e", "process.stdout.write('not json')"],
    });
    await expect(
      provider.generateObject({ messages: [{ role: "user", content: "x" }], schema: {} }),
    ).rejects.toThrow(/non-json/i);
  });
});
