import { describe, expect, it } from "vitest";
import { expectParses } from "../parse-helper.js";

describe("literal expressions", () => {
  it("parses string literals (single line)", async () => {
    const project = await expectParses(`
      persona p { description = "coordinator, dry" }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses integer literals", async () => {
    const project = await expectParses(`
      persona p { verbosity_level = 3 }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses decimal literals", async () => {
    const project = await expectParses(`
      persona p { temperature = 0.3 }
    `);
    expect(project.declarations).toHaveLength(1);
  });

  it("parses boolean literals", async () => {
    const project = await expectParses(`
      persona p { active = true }
      persona q { active = false }
    `);
    expect(project.declarations).toHaveLength(2);
  });

  it("parses null literal", async () => {
    const project = await expectParses(`
      persona p { description = null }
    `);
    expect(project.declarations).toHaveLength(1);
  });
});
