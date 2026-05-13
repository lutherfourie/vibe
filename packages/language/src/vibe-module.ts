/**
 * Vibe language module — wires the generated grammar/AST into a Langium
 * service container. Mirrors the canonical Langium scaffold so the LSP
 * server, validator, and any future custom services can be injected here.
 *
 * Scaffold only. Validators and custom service overrides land in Phase 1
 * once the real grammar is designed.
 */

import type { Module } from "langium";
import { inject } from "langium";
import {
  createDefaultModule,
  createDefaultSharedModule,
  type DefaultSharedModuleContext,
  type LangiumServices,
  type LangiumSharedServices,
  type PartialLangiumServices,
} from "langium/lsp";
import {
  VibeGeneratedModule,
  VibeGeneratedSharedModule,
} from "./generated/module.js";
import { registerValidationChecks } from "./vibe-validator.js";

/**
 * Declaration of custom services to be injected on top of Langium defaults.
 * Empty for the placeholder scaffold — keep the shape so future overrides
 * (Vibe-specific validator, hover provider for the LLM resolver preview)
 * have a home.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface VibeAddedServices {}

export type VibeServices = LangiumServices & VibeAddedServices;

export const VibeModule: Module<
  VibeServices,
  PartialLangiumServices & VibeAddedServices
> = {
  // intentionally empty
};

/**
 * Create the full set of services required by Langium.
 *
 * Returns both the shared (cross-language) services and the Vibe-specific
 * services. The shared services are reused across languages; the Vibe
 * services are unique to the Vibe language.
 */
export function createVibeServices(context: DefaultSharedModuleContext): {
  shared: LangiumSharedServices;
  Vibe: VibeServices;
} {
  const shared = inject(
    createDefaultSharedModule(context),
    VibeGeneratedSharedModule,
  );
  const Vibe = inject(
    createDefaultModule({ shared }),
    VibeGeneratedModule,
    VibeModule,
  );
  shared.ServiceRegistry.register(Vibe);
  registerValidationChecks(Vibe);
  return { shared, Vibe };
}
