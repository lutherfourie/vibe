import { describe, expect, it } from "vitest";
import {
  isPlugin,
  isReference,
  isStringLiteral,
} from "../../src/generated/ast.js";
import { firstPlugin } from "../ast-helpers.js";
import { expectParseFailure, expectParses } from "../parse-helper.js";

// Task 12: plugin primitive — spec §2.3.
//   plugin <Identifier> "{" <keyValuePairs> "}"
// Required fields: `impl` (TS module path string). Optional: `version` and any
// other plugin-author metadata. v0 grammar is permissive — required-field
// enforcement is a Task 15+ validator concern. Loaded TS modules contribute
// tools that become callable as `plugin.<name>.<tool-name>` references.

describe("plugin primitive", () => {
  it("parses plugin with impl path", async () => {
    const project = await expectParses(`
      plugin asset_pipeline {
        impl = "./plugins/asset-pipeline/index.ts"
      }
    `);
    expect(project.declarations).toHaveLength(1);
    const plugin = firstPlugin(project);
    expect(isPlugin(plugin)).toBe(true);
    expect(plugin.$type).toBe("Plugin");
    expect(plugin.name).toBe("asset_pipeline");
    expect(plugin.fields).toHaveLength(1);
    const impl = plugin.fields[0];
    expect(impl.name).toBe("impl");
    expect(isStringLiteral(impl.value)).toBe(true);
    if (isStringLiteral(impl.value)) {
      expect(impl.value.value).toBe("./plugins/asset-pipeline/index.ts");
    }
  });

  it("parses plugin with version field", async () => {
    const project = await expectParses(`
      plugin asset_pipeline {
        impl    = "./plugins/asset-pipeline/index.ts"
        version = "0.1.0"
      }
    `);
    expect(project.declarations).toHaveLength(1);
    const plugin = firstPlugin(project);
    expect(isPlugin(plugin)).toBe(true);
    expect(plugin.$type).toBe("Plugin");
    expect(plugin.name).toBe("asset_pipeline");
    expect(plugin.fields).toHaveLength(2);
    const [impl, version] = plugin.fields;
    expect(impl.name).toBe("impl");
    expect(version.name).toBe("version");
    expect(isStringLiteral(impl.value)).toBe(true);
    if (isStringLiteral(impl.value)) {
      expect(impl.value.value).toBe("./plugins/asset-pipeline/index.ts");
    }
    expect(isStringLiteral(version.value)).toBe(true);
    if (isStringLiteral(version.value)) {
      expect(version.value.value).toBe("0.1.0");
    }
  });

  it("parses plugin with an empty body (grammar permissive — Task 15 enforces required `impl`)", async () => {
    // Spec §2.3 marks `impl` as required, but the grammar's Plugin rule uses
    // `fields+=Field*`, so the empty body is syntactically valid. Lock it in
    // so a future grammar tightening can't break it silently. Mirrors the
    // harness/memory/persona patterns.
    const project = await expectParses(`
      plugin empty_plugin { }
    `);
    const plugin = firstPlugin(project);
    expect(isPlugin(plugin)).toBe(true);
    expect(plugin.$type).toBe("Plugin");
    expect(plugin.name).toBe("empty_plugin");
    expect(plugin.fields).toHaveLength(0);
  });

  it("parses multiple plugin declarations", async () => {
    const project = await expectParses(`
      plugin asset_pipeline { impl = "./plugins/asset-pipeline/index.ts" }
      plugin deploy         { impl = "./plugins/deploy/index.ts" }
    `);
    expect(project.declarations).toHaveLength(2);
    const [first, second] = project.declarations;
    if (!isPlugin(first) || !isPlugin(second)) {
      throw new Error("Expected both declarations to be Plugin");
    }
    expect(first.$type).toBe("Plugin");
    expect(second.$type).toBe("Plugin");
    expect(first.name).toBe("asset_pipeline");
    expect(second.name).toBe("deploy");
  });

  it("parses plugin with non-string metadata fields", async () => {
    // Spec §2.3 keeps the plugin body open-ended — any well-formed key/value
    // pair is allowed. Lock in that non-string values (booleans, references,
    // numbers) parse cleanly so plugin-author metadata isn't constrained
    // until a Task 15+ validator says otherwise.
    const project = await expectParses(`
      plugin asset_pipeline {
        impl    = "./plugins/asset-pipeline/index.ts"
        enabled = true
        owner   = agent.izsha
        ttl     = 3600
      }
    `);
    const plugin = firstPlugin(project);
    expect(isPlugin(plugin)).toBe(true);
    expect(plugin.fields).toHaveLength(4);
    const [, enabled, owner, ttl] = plugin.fields;
    expect(enabled.name).toBe("enabled");
    expect(enabled.value.$type).toBe("BooleanLiteral");
    expect(owner.name).toBe("owner");
    expect(isReference(owner.value)).toBe(true);
    if (isReference(owner.value)) {
      expect(owner.value.segments).toEqual(["agent", "izsha"]);
    }
    expect(ttl.name).toBe("ttl");
    expect(ttl.value.$type).toBe("NumberLiteral");
  });

  it("rejects a plugin declaration missing the body", async () => {
    // Spec §2.3 grammar requires `{ ... }`. Bodyless declaration is malformed.
    const messages = await expectParseFailure(`
      plugin asset_pipeline
    `);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects a plugin declaration missing the name", async () => {
    // `plugin <Identifier> { ... }` — without the identifier this can't bind.
    const messages = await expectParseFailure(`
      plugin { impl = "./plugins/asset-pipeline/index.ts" }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects a plugin field missing its value", async () => {
    // Field is `name=Name (':' type=TypeReference)? '=' value=Expression` —
    // omitting `= <expr>` is malformed.
    const messages = await expectParseFailure(`
      plugin asset_pipeline { impl }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });
});
