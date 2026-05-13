import { describe, expect, it } from "vitest";
import {
  isProvider,
  isReference,
  isStringLiteral,
} from "../../src/generated/ast.js";
import { firstProvider } from "../ast-helpers.js";
import { expectParseFailure, expectParses } from "../parse-helper.js";

// Task 7: provider primitive. Spec §2.1 — `provider <DottedId> { <fields> }`.
// Required field `mode` is one of `cli` | `api` (parsed as a single-segment
// Reference, since the grammar has no enum constraint yet — that's a Task 15
// validator concern). Optional fields cover both modes' surface area.

describe("provider primitive", () => {
  it("parses minimal API-mode provider", async () => {
    const project = await expectParses(`
      provider cerebras.glm_4_7 { mode = api }
    `);
    expect(project.declarations).toHaveLength(1);
    const provider = firstProvider(project);
    expect(isProvider(provider)).toBe(true);
    expect(provider.name.segments).toEqual(["cerebras", "glm_4_7"]);
    expect(provider.fields).toHaveLength(1);
    const modeField = provider.fields[0];
    expect(modeField.name).toBe("mode");
    expect(isReference(modeField.value)).toBe(true);
    if (isReference(modeField.value)) {
      expect(modeField.value.segments).toEqual(["api"]);
    }
  });

  it("parses CLI-mode provider with lifecycle override", async () => {
    const project = await expectParses(`
      provider anthropic.claude_code {
        mode      = cli
        lifecycle = long_lived
      }
    `);
    expect(project.declarations).toHaveLength(1);
    const provider = firstProvider(project);
    expect(provider.name.segments).toEqual(["anthropic", "claude_code"]);
    expect(provider.fields).toHaveLength(2);
    expect(provider.fields.map((f) => f.name)).toEqual(["mode", "lifecycle"]);
    const lifecycle = provider.fields[1];
    expect(isReference(lifecycle.value)).toBe(true);
    if (isReference(lifecycle.value)) {
      expect(lifecycle.value.segments).toEqual(["long_lived"]);
    }
  });

  it("parses API-mode provider with base URL override", async () => {
    const project = await expectParses(`
      provider cerebras.glm_4_7 {
        mode    = api
        baseUrl = "https://api.cerebras.ai/v1"
        model   = "glm-4.7"
      }
    `);
    expect(project.declarations).toHaveLength(1);
    const provider = firstProvider(project);
    expect(provider.name.segments).toEqual(["cerebras", "glm_4_7"]);
    expect(provider.fields).toHaveLength(3);
    const [, baseUrl, model] = provider.fields;
    expect(baseUrl.name).toBe("baseUrl");
    expect(isStringLiteral(baseUrl.value)).toBe(true);
    if (isStringLiteral(baseUrl.value)) {
      expect(baseUrl.value.value).toBe("https://api.cerebras.ai/v1");
    }
    expect(model.name).toBe("model");
    expect(isStringLiteral(model.value)).toBe(true);
    if (isStringLiteral(model.value)) {
      expect(model.value.value).toBe("glm-4.7");
    }
  });

  it("parses multiple provider declarations", async () => {
    const project = await expectParses(`
      provider anthropic.claude_code { mode = cli }
      provider openai.codex          { mode = cli }
      provider cerebras.glm_4_7      { mode = api }
    `);
    expect(project.declarations).toHaveLength(3);
    const names = project.declarations.map((d) => {
      if (!isProvider(d)) {
        throw new Error(`Expected Provider, got ${(d as { $type?: string }).$type}`);
      }
      return d.name.segments.join(".");
    });
    expect(names).toEqual([
      "anthropic.claude_code",
      "openai.codex",
      "cerebras.glm_4_7",
    ]);
  });

  it("rejects a provider declaration missing the body", async () => {
    // Spec §2.1 grammar requires `{ ... }`. Bodyless declaration is malformed.
    const messages = await expectParseFailure(`
      provider cerebras.glm_4_7
    `);
    expect(messages.length).toBeGreaterThan(0);
  });
});
