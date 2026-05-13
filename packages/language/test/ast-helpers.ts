import { isPersona, isProvider } from "../src/generated/ast.js";
import type { Persona, Provider } from "../src/generated/ast.js";

export function firstPersona(project: { declarations: unknown[] }): Persona {
  const decl = project.declarations[0];
  if (!isPersona(decl)) {
    throw new Error(
      `Expected first declaration to be Persona, got ${(decl as { $type?: string })?.$type}`,
    );
  }
  return decl;
}

export function firstProvider(project: { declarations: unknown[] }): Provider {
  const decl = project.declarations[0];
  if (!isProvider(decl)) {
    throw new Error(
      `Expected first declaration to be Provider, got ${(decl as { $type?: string })?.$type}`,
    );
  }
  return decl;
}
