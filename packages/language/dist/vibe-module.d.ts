/**
 * Vibe language module — wires the generated grammar/AST into a Langium
 * service container. The LSP server, the three Phase-1 validators
 * (duplicate-declarations, required-resolver-route, cross-reference
 * resolution), and any future custom services are injected here.
 */
import type { Module } from "langium";
import { type DefaultSharedModuleContext, type LangiumServices, type LangiumSharedServices, type PartialLangiumServices } from "langium/lsp";
/**
 * Custom services to be injected on top of Langium defaults. Empty for SD1
 * (the validators register via registerValidationChecks rather than DI),
 * but the type stays for future SD2 hover provider, completion provider,
 * and LLM-resolver preview slots.
 */
export interface VibeAddedServices {
}
export type VibeServices = LangiumServices & VibeAddedServices;
export declare const VibeModule: Module<VibeServices, PartialLangiumServices & VibeAddedServices>;
/**
 * Create the full set of services required by Langium.
 *
 * Returns both the shared (cross-language) services and the Vibe-specific
 * services. The shared services are reused across languages; the Vibe
 * services are unique to the Vibe language.
 */
export declare function createVibeServices(context: DefaultSharedModuleContext): {
    shared: LangiumSharedServices;
    Vibe: VibeServices;
};
//# sourceMappingURL=vibe-module.d.ts.map