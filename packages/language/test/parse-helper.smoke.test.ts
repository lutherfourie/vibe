import { describe, expect, it } from "vitest";
import { expectParses } from "./parse-helper.js";

describe("parse helper smoke test", () => {
  it("parses the existing placeholder grammar — empty agent + route", async () => {
    const project = await expectParses(`
      agent planner {}
      route planner -> worker
    `);
    expect(project.declarations).toHaveLength(2);
  });
});
