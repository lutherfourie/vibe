import { describe, expect, it } from "vitest";
import {
  isComparisonExpr,
  isGuard,
  isNumberLiteral,
  isOperand,
  isRange,
  isReference,
  isRule,
} from "../../src/generated/ast.js";
import { expectParseFailure, expectParses } from "../parse-helper.js";

// Additive `rule` primitive — a first-class home for conditional feel rules
// (gamespree Feel Compiler: combo-break shake threshold + amp lerp, score-popup
// tiers). A rule body mixes ordinary metadata Fields with `when { <condition> }
// then { <assignments> }` Guard blocks. The data-only Field/Expression rules
// every existing primitive uses are untouched, so legacy .vibe files are
// unaffected (locked by the canonical-project integration sweep).

describe("rule primitive", () => {
  it("parses a rule with metadata fields and a guard block", async () => {
    const project = await expectParses(`
      rule combo_break_shake {
        threshold = 4
        when { combo >= 4 } then { shake.amp = 0.08 .. 0.22 }
      }
    `);
    expect(project.declarations).toHaveLength(1);
    const rule = project.declarations[0];
    if (!isRule(rule)) throw new Error("Expected a Rule declaration");
    expect(rule.$type).toBe("Rule");
    expect(rule.name).toBe("combo_break_shake");

    // The metadata field rides the existing Field rule.
    expect(rule.fields).toHaveLength(1);
    expect(rule.fields[0].name).toBe("threshold");
    expect(isNumberLiteral(rule.fields[0].value)).toBe(true);

    // The guard carries a comparison condition and a range assignment.
    expect(rule.guards).toHaveLength(1);
    const guard = rule.guards[0];
    expect(isGuard(guard)).toBe(true);
    expect(isComparisonExpr(guard.condition)).toBe(true);
    if (isComparisonExpr(guard.condition)) {
      expect(guard.condition.operator).toBe(">=");
      expect(isOperand(guard.condition.left)).toBe(true);
      expect(isOperand(guard.condition.right)).toBe(true);
    }

    expect(guard.assignments).toHaveLength(1);
    const assign = guard.assignments[0];
    expect(isReference(assign.target)).toBe(true);
    expect(assign.target.segments).toEqual(["shake", "amp"]);
    expect(isRange(assign.value)).toBe(true);
    if (isRange(assign.value)) {
      expect(assign.value.low.value).toBe(0.08);
      expect(assign.value.high.value).toBe(0.22);
    }
  });

  it("parses a rule with multiple guards and a plain-expression assignment", async () => {
    const project = await expectParses(`
      rule score_tiers {
        when { score >= 1000 } then { tier = "gold" }
        when { score >= 500 } then { tier = "silver" }
      }
    `);
    const rule = project.declarations[0];
    if (!isRule(rule)) throw new Error("Expected a Rule declaration");
    expect(rule.guards).toHaveLength(2);
  });

  it("parses a rule with an empty body (grammar stays permissive)", async () => {
    const project = await expectParses(`rule noop { }`);
    const rule = project.declarations[0];
    if (!isRule(rule)) throw new Error("Expected a Rule declaration");
    expect(rule.fields).toHaveLength(0);
    expect(rule.guards).toHaveLength(0);
  });

  it("keeps `rule` usable as a field name / reference segment (non-breaking)", async () => {
    // `rule` was added to the Name rule, so it must still work as an
    // identifier in field-name and reference-segment positions, exactly like
    // the other declaration keywords (keyword-segments.test.ts contract).
    // Note: declaration HEADERS bind `name=ID`, so `rule` (like every other
    // keyword) cannot be a declaration name — that's the pre-existing design.
    const project = await expectParses(`
      agent a { rule = persona.rule }
      route resolver -> p
    `);
    expect(project.declarations.length).toBeGreaterThan(0);
  });

  it("rejects a rule missing its name", async () => {
    const messages = await expectParseFailure(`rule { threshold = 4 }`);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects a guard with no `then` block", async () => {
    const messages = await expectParseFailure(`
      rule broken { when { combo >= 4 } }
    `);
    expect(messages.length).toBeGreaterThan(0);
  });
});
