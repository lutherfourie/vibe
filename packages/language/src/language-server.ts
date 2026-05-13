#!/usr/bin/env node
/**
 * Vibe Language Server entry point.
 *
 * Started by the VS Code extension via the node-ipc transport. Boots the
 * Langium-emitted LSP for the placeholder grammar — parsing, AST, and
 * diagnostics flow through Langium's defaults until Vibe-specific services
 * are added.
 */

import { startLanguageServer } from "langium/lsp";
import { NodeFileSystem } from "langium/node";
import {
  createConnection,
  ProposedFeatures,
} from "vscode-languageserver/node.js";
import { createVibeServices } from "./vibe-module.js";

const connection = createConnection(ProposedFeatures.all);
const { shared } = createVibeServices({
  connection,
  ...NodeFileSystem,
});
startLanguageServer(shared);
