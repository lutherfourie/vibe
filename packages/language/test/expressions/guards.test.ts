import { describe, expect, it } from "vitest";
import {
  isComparisonExpr,
  isLogicalExpr,
  isOperand,
  isRange,
  isRule,
} from "../../src/generated/ast.js";
import type { Condition } from "../../src/generated/ast.js";
import { expectParses } from "../parse-helper.js";

// Guard-block expression grammar (additive, reachable only inside rule/director
// bodies). Covers every comparison/logical operator, operand kinds, parenthesis
// grouping, and the numeric range operand used for lerp endpoints. These
// productions never touch the data-only Expression rule, so existing .vibe
// files are unaffected.

async function firstCondition(conditionSrc: string): Promise<Condition> {
  const project = await expectParses(`
    rule r {
      when { ${conditionSrc} } then { x = 1 }
    }
  `);
  const rule = project.declarations[0];
  if (!isRule(rule)) throw new Error("Expected a Rule declaration");
  return rule.guards[0].condition;
}

describe("guard condition expressions", () => {
  const comparisonOps = ["==", "!=", ">", ">=", "<", "<="] as const;
  for (const op of comparisonOps) {
    it(`parses comparison operator ${op}`, async () => {
      const cond = await firstCondition(`combo ${op} 4`);
      expect(isComparisonExpr(cond)).toBe(true);
      if (isComparisonExpr(cond)) {
        expect(cond.operator).toBe(op);
      }
    });
  }

  it("parses logical && and ||", async () => {
    const andCond = await firstCondition(`a > 1 && b > 2`);
    expect(isLogicalExpr(andCond)).toBe(true);
    if (isLogicalExpr(andCond)) expect(andCond.operator).toBe("&&");

    const orCond = await firstCondition(`a > 1 || b > 2`);
    expect(isLogicalExpr(orCond)).toBe(true);
    if (isLogicalExpr(orCond)) expect(orCond.operator).toBe("||");
  });

  it("honors parentheses to override precedence", async () => {
    // Without parens `&&` binds tighter; parens force the `||` to be inner.
    const cond = await firstCondition(`(a > 1 || b > 2) && c > 3`);
    expect(isLogicalExpr(cond)).toBe(true);
    if (isLogicalExpr(cond)) {
      expect(cond.operator).toBe("&&");
      expect(isLogicalExpr(cond.left)).toBe(true);
      if (isLogicalExpr(cond.left)) expect(cond.left.operator).toBe("||");
    }
  });

  it("accepts reference, number, string, and boolean operands", async () => {
    const refCond = await firstCondition(`mood.stress > 0.5`);
    expect(isComparisonExpr(refCond)).toBe(true);

    const strCond = await firstCondition(`label == "boss"`);
    expect(isComparisonExpr(strCond)).toBe(true);

    const boolCond = await firstCondition(`enabled == true`);
    expect(isComparisonExpr(boolCond)).toBe(true);
    if (isComparisonExpr(boolCond)) {
      expect(isOperand(boolCond.right)).toBe(true);
    }
  });

  it("accepts a bare operand as a whole condition", async () => {
    const cond = await firstCondition(`active`);
    expect(isOperand(cond)).toBe(true);
  });

  it("parses a numeric range assignment value (lerp endpoints)", async () => {
    const project = await expectParses(`
      rule r {
        when { combo >= 4 } then { shake.amp = 0.08 .. 0.22 }
      }
    `);
    const rule = project.declarations[0];
    if (!isRule(rule)) throw new Error("Expected a Rule declaration");
    const value = rule.guards[0].assignments[0].value;
    expect(isRange(value)).toBe(true);
    if (isRange(value)) {
      expect(value.low.value).toBe(0.08);
      expect(value.high.value).toBe(0.22);
    }
  });

  it("supports multiple assignments in one then-block", async () => {
    const project = await expectParses(`
      director d {
        when { wave >= 3 } then { music = "intense" intensity = 2 fade = 0.5 }
      }
    `);
    const director = project.declarations[0];
    if (director.$type !== "Director") throw new Error("Expected a Director");
    expect(director.guards[0].assignments).toHaveLength(3);
  });
});
