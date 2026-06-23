import { describe, expect, it } from "vitest";
import { extractSelfPlan } from "../../src/self/self-plan.js";
import { expectParses } from "../parse-helper.js";

// Self-plan projection of the additive rule/director primitives. The structured
// AST is the authority; the self-plan summarizes each guard as a stringified
// infix condition plus an assignments map (ranges become { low, high }). This
// is the shape the gamespree Feel Compiler consumes for its director cadence
// and combo-break feel rules.

describe("self-plan extraction — rule / director guards", () => {
  it("projects a rule's metadata fields and guard assignments", async () => {
    const project = await expectParses(`
      rule combo_break_shake {
        threshold = 4
        when { combo >= 4 } then { shake.amp = 0.08 .. 0.22 }
      }
      route resolver -> p
    `);
    const plan = extractSelfPlan(project, { name: "feel" });

    expect(plan.rules).toHaveLength(1);
    expect(plan.directors).toHaveLength(0);

    const rule = plan.rules[0];
    expect(rule.name).toBe("combo_break_shake");
    expect(rule.fields).toEqual({ threshold: 4 });
    expect(rule.guards).toHaveLength(1);
    expect(rule.guards[0].condition).toBe("combo >= 4");
    expect(rule.guards[0].assignments).toEqual({
      "shake.amp": { low: 0.08, high: 0.22 },
    });
  });

  it("projects a director's compound conditions with parenthesized grouping", async () => {
    const project = await expectParses(`
      director cat_director {
        cadence = 7.5
        when { wave >= 3 && derangement >= 4 } then { music = "intense" intensity = 2 }
      }
      route resolver -> p
    `);
    const plan = extractSelfPlan(project, { name: "feel" });

    expect(plan.directors).toHaveLength(1);
    const director = plan.directors[0];
    expect(director.name).toBe("cat_director");
    expect(director.fields).toEqual({ cadence: 7.5 });
    expect(director.guards[0].condition).toBe(
      "(wave >= 3) && (derangement >= 4)",
    );
    expect(director.guards[0].assignments).toEqual({
      music: "intense",
      intensity: 2,
    });
  });

  it("emits no rules/directors when none are declared (backward compatible)", async () => {
    const project = await expectParses(`
      agent a { prompt = "x" }
      route resolver -> p
    `);
    const plan = extractSelfPlan(project, { name: "feel" });
    expect(plan.rules).toEqual([]);
    expect(plan.directors).toEqual([]);
  });
});
