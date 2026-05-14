import { describe, expect, it } from "vitest";
import { isReference, isStringLiteral } from "../../src/generated/ast.js";
import { firstCorrected } from "../ast-helpers.js";
import { expectParseFailure, expectParses } from "../parse-helper.js";

describe("corrected primitive", () => {
  it("parses a corrected block referencing a tag", async () => {
    const project = await expectParses(`
      corrected for "resolver#tag123" {
        description = "human override"
        at = "2026-05-14T03:00:00Z"
        by = "luther"
      }
    `);
    const corrected = firstCorrected(project);
    expect(corrected.$type).toBe("Corrected");
    expect(corrected.target).toBe("resolver#tag123");
    expect(corrected.fields).toHaveLength(3);
    const descField = corrected.fields[0];
    expect(descField.name).toBe("description");
    expect(isStringLiteral(descField.value)).toBe(true);
    if (isStringLiteral(descField.value)) {
      expect(descField.value.value).toBe("human override");
    }
  });

  it("rejects a corrected block missing the `for` clause", async () => {
    const messages = await expectParseFailure(`
      corrected { description = "x" }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects a corrected block missing the body", async () => {
    const messages = await expectParseFailure(`
      corrected for "resolver#x"
    `);
    expect(messages.length).toBeGreaterThan(0);
  });
});
