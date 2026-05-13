import {
  isFallback,
  isHarness,
  isMemory,
  isPersona,
  isPlugin,
  isProvider,
  isRoute,
  isTrigger,
} from "../src/generated/ast.js";
import type {
  Fallback,
  Harness,
  Memory,
  Persona,
  Plugin,
  Provider,
  Route,
  Trigger,
} from "../src/generated/ast.js";

function first<T>(
  project: { declarations: unknown[] },
  guard: (item: unknown) => item is T,
  typeName: string,
): T {
  const decl = project.declarations[0];
  if (!guard(decl)) {
    throw new Error(
      `Expected first declaration to be ${typeName}, got ${(decl as { $type?: string })?.$type}`,
    );
  }
  return decl;
}

export function firstPersona(project: { declarations: unknown[] }): Persona {
  return first(project, isPersona, "Persona");
}

export function firstProvider(project: { declarations: unknown[] }): Provider {
  return first(project, isProvider, "Provider");
}

export function firstRoute(project: { declarations: unknown[] }): Route {
  return first(project, isRoute, "Route");
}

export function firstFallback(project: { declarations: unknown[] }): Fallback {
  return first(project, isFallback, "Fallback");
}

export function firstMemory(project: { declarations: unknown[] }): Memory {
  return first(project, isMemory, "Memory");
}

export function firstHarness(project: { declarations: unknown[] }): Harness {
  return first(project, isHarness, "Harness");
}

export function firstPlugin(project: { declarations: unknown[] }): Plugin {
  return first(project, isPlugin, "Plugin");
}

export function firstTrigger(project: { declarations: unknown[] }): Trigger {
  return first(project, isTrigger, "Trigger");
}
