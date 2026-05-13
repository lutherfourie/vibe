import { describe, expect, it } from "vitest";
import {
  isFallback,
  isReference,
  isRoute,
} from "../../src/generated/ast.js";
import { firstFallback, firstRoute } from "../ast-helpers.js";
import { expectParseFailure, expectParses } from "../parse-helper.js";

// Task 8: route primitive — full surface. Spec §2.2:
//   route <Identifier> "->" <DottedId> ("{" <fields> "}")?
//   fallback           "->" <DottedId> ("{" <fields> "}")?
// Reserved route names (`resolver`, `fallback`) are validator territory
// (Task 15); the grammar only needs to accept the shape.

describe("route primitive", () => {
  it("parses simple route to dotted-id target", async () => {
    const project = await expectParses(`
      route planner -> anthropic.claude_code
    `);
    expect(project.declarations).toHaveLength(1);
    const route = firstRoute(project);
    expect(route.$type).toBe("Route");
    expect(route.from).toBe("planner");
    expect(route.to.segments).toEqual(["anthropic", "claude_code"]);
    expect(route.fields).toHaveLength(0);
  });

  it("parses route with body (per-route overrides)", async () => {
    const project = await expectParses(`
      route planner -> anthropic.claude_code { mode = cli }
    `);
    expect(project.declarations).toHaveLength(1);
    const route = firstRoute(project);
    expect(route.$type).toBe("Route");
    expect(route.from).toBe("planner");
    expect(route.to.segments).toEqual(["anthropic", "claude_code"]);
    expect(route.fields).toHaveLength(1);
    const modeField = route.fields[0];
    expect(modeField.name).toBe("mode");
    expect(isReference(modeField.value)).toBe(true);
    if (isReference(modeField.value)) {
      expect(modeField.value.segments).toEqual(["cli"]);
    }
  });

  it("parses fallback declaration", async () => {
    const project = await expectParses(`
      fallback -> cerebras.glm_4_7
    `);
    expect(project.declarations).toHaveLength(1);
    const fallback = firstFallback(project);
    expect(fallback.$type).toBe("Fallback");
    expect(fallback.to.segments).toEqual(["cerebras", "glm_4_7"]);
    expect(fallback.fields).toHaveLength(0);
  });

  it("parses fallback declaration with body", async () => {
    const project = await expectParses(`
      fallback -> cerebras.glm_4_7 { mode = api }
    `);
    expect(project.declarations).toHaveLength(1);
    const fallback = firstFallback(project);
    expect(fallback.$type).toBe("Fallback");
    expect(fallback.to.segments).toEqual(["cerebras", "glm_4_7"]);
    expect(fallback.fields).toHaveLength(1);
    expect(fallback.fields[0].name).toBe("mode");
    expect(isReference(fallback.fields[0].value)).toBe(true);
    if (isReference(fallback.fields[0].value)) {
      expect(fallback.fields[0].value.segments).toEqual(["api"]);
    }
  });

  it("parses multiple routes including resolver", async () => {
    const project = await expectParses(`
      route planner   -> anthropic.claude_code
      route generator -> openai.codex
      route resolver  -> cerebras.glm_4_7
      fallback        -> cerebras.glm_4_7
    `);
    expect(project.declarations).toHaveLength(4);
    const [planner, generator, resolver, fallback] = project.declarations;
    if (
      !isRoute(planner) ||
      !isRoute(generator) ||
      !isRoute(resolver) ||
      !isFallback(fallback)
    ) {
      throw new Error("Unexpected declaration types in routes block");
    }
    expect(planner.from).toBe("planner");
    expect(planner.to.segments).toEqual(["anthropic", "claude_code"]);
    expect(generator.from).toBe("generator");
    expect(generator.to.segments).toEqual(["openai", "codex"]);
    expect(resolver.from).toBe("resolver");
    expect(resolver.to.segments).toEqual(["cerebras", "glm_4_7"]);
    expect(fallback.to.segments).toEqual(["cerebras", "glm_4_7"]);
  });

  it("parses a route to a single-segment target (grammar permissive)", async () => {
    // The smoke test exercises this shape (`route planner -> worker`).
    // QualifiedName uses `('.' ...)*` so a one-segment target is syntactically
    // valid even though spec §2.2 uses dotted-id targets in canonical form.
    const project = await expectParses(`
      route planner -> worker
    `);
    const route = firstRoute(project);
    expect(route.$type).toBe("Route");
    expect(route.from).toBe("planner");
    expect(route.to.segments).toEqual(["worker"]);
  });

  it("rejects a route declaration missing the arrow", async () => {
    const messages = await expectParseFailure(`
      route planner anthropic.claude_code
    `);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects a fallback declaration missing the target", async () => {
    const messages = await expectParseFailure(`
      fallback ->
    `);
    expect(messages.length).toBeGreaterThan(0);
  });
});
