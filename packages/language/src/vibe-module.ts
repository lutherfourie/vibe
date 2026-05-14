/**
 * Vibe language module — wires the generated grammar/AST into a Langium
 * service container. The LSP server, the three Phase-1 validators
 * (duplicate-declarations, required-resolver-route, cross-reference
 * resolution), and any future custom services are injected here.
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
 * Custom services to be injected on top of Langium defaults. Empty for SD1
 * (the validators register via registerValidationChecks rather than DI),
 * but the type stays for future SD2 hover provider, completion provider,
 * and LLM-resolver preview slots.
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
