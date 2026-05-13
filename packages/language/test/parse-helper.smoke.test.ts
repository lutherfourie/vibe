import { describe, expect, it } from "vitest";
import { expectParseFailure, expectParses } from "./parse-helper.js";

describe("parse helper smoke test", () => {
  it("parses the existing placeholder grammar — empty agent + route", async () => {
    const project = await expectParses(`
      agent planner {}
      route planner -> worker
    `);
    expect(project.declarations).toHaveLength(2);
  });

  it("expectParseFailure surfaces errors on malformed input", async () => {
    const messages = await expectParseFailure(`agent {}`);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("expectParseFailure throws when input parses cleanly", async () => {
    await expect(expectParseFailure(`agent planner {}`)).rejects.toThrow(
      /Expected parse failure but source parsed cleanly/,
    );
  });
});
