import { describe, expect, it } from "vitest";
import {
  isDirector,
  isLogicalExpr,
  isNumberLiteral,
} from "../../src/generated/ast.js";
import { expectParseFailure, expectParses } from "../parse-helper.js";

// Additive `director` primitive — the cohesive adaptive layer for the gamespree
// Feel Compiler (CatDirector cadence + ChooseIntent threshold gates). Same body
// shape as `rule` (Field | Guard), but a distinct declaration keyword so the
// adaptive director reads as its own concept. Cross-kind name collisions with a
// `rule` of the same name are allowed (different reference namespaces), matching
// the validator's same-kind-only duplicate policy.

describe("director primitive", () => {
  it("parses a director with cadence metadata and threshold-gated guards", async () => {
    const project = await expectParses(`
      director cat_director {
        cadence = 7.5
        when { wave >= 3 && derangement >= 4 } then { music = "intense" }
        when { (stress > 0.7) || mastery < 0.3 } then { intent = "challenge" }
      }
    `);
    expect(project.declarations).toHaveLength(1);
    const director = project.declarations[0];
    if (!isDirector(director)) throw new Error("Expected a Director declaration");
    expect(director.$type).toBe("Director");
    expect(director.name).toBe("cat_director");

    expect(director.fields).toHaveLength(1);
    expect(director.fields[0].name).toBe("cadence");
    expect(isNumberLiteral(director.fields[0].value)).toBe(true);

    expect(director.guards).toHaveLength(2);
    // First guard's condition is a logical `&&` over two comparisons.
    const first = director.guards[0];
    expect(isLogicalExpr(first.condition)).toBe(true);
    if (isLogicalExpr(first.condition)) {
      expect(first.condition.operator).toBe("&&");
    }
  });

  it("allows `&&` / `||` precedence: `||` is the outer node", async () => {
    const project = await expectParses(`
      director d {
        when { a > 1 && b > 2 || c > 3 } then { x = 1 }
      }
    `);
    const director = project.declarations[0];
    if (!isDirector(director)) throw new Error("Expected a Director declaration");
    const cond = director.guards[0].condition;
    // `&&` binds tighter than `||`, so the top node is the `||`.
    expect(isLogicalExpr(cond)).toBe(true);
    if (isLogicalExpr(cond)) {
      expect(cond.operator).toBe("||");
    }
  });

  it("parses an empty director body", async () => {
    const project = await expectParses(`director empty { }`);
    const director = project.declarations[0];
    if (!isDirector(director)) throw new Error("Expected a Director declaration");
    expect(director.fields).toHaveLength(0);
    expect(director.guards).toHaveLength(0);
  });

  it("keeps `director`/`when`/`then` usable as identifiers (non-breaking)", async () => {
    const project = await expectParses(`
      agent a { director = "x" when = "y" then = "z" }
      route resolver -> p
    `);
    expect(project.declarations.length).toBeGreaterThan(0);
  });

  it("rejects a director missing its name", async () => {
    const messages = await expectParseFailure(`director { cadence = 7.5 }`);
    expect(messages.length).toBeGreaterThan(0);
  });
});
