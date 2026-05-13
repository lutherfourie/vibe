import { isPersona } from "../src/generated/ast.js";
import type { Persona } from "../src/generated/ast.js";

export function firstPersona(project: { declarations: unknown[] }): Persona {
  const decl = project.declarations[0];
  if (!isPersona(decl)) {
    throw new Error(
      `Expected first declaration to be Persona, got ${(decl as { $type?: string })?.$type}`,
    );
  }
  return decl;
}
