import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const requireFromTest = createRequire(import.meta.url);

describe("compiled VS Code extension runtime", () => {
  it("loads workspace helpers without requiring the ESM language package through CommonJS", () => {
    expect(() => {
      requireFromTest("../dist/vibe-workspace.js");
    }).not.toThrow();
  });
});
