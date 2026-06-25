/**
 * Vibe language module — wires the generated grammar/AST into a Langium
 * service container. The LSP server, the three Phase-1 validators
 * (duplicate-declarations, required-resolver-route, cross-reference
 * resolution), and any future custom services are injected here.
 */
import { inject } from "langium";
import { createDefaultModule, createDefaultSharedModule, } from "langium/lsp";
import { VibeGeneratedModule, VibeGeneratedSharedModule, } from "./generated/module.js";
import { registerValidationChecks } from "./vibe-validator.js";
export const VibeModule = {
// intentionally empty
};
/**
 * Create the full set of services required by Langium.
 *
 * Returns both the shared (cross-language) services and the Vibe-specific
 * services. The shared services are reused across languages; the Vibe
 * services are unique to the Vibe language.
 */
export function createVibeServices(context) {
    const shared = inject(createDefaultSharedModule(context), VibeGeneratedSharedModule);
    const Vibe = inject(createDefaultModule({ shared }), VibeGeneratedModule, VibeModule);
    shared.ServiceRegistry.register(Vibe);
    registerValidationChecks(Vibe);
    return { shared, Vibe };
}
//# sourceMappingURL=vibe-module.js.map