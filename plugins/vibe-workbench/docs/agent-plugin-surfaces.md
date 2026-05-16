# Agent Plugin Surfaces

Vibe Workbench is packaged for both Codex and Claude Code because those are concrete copilot surfaces the user wants to use. That should not become a design constraint for Vibe itself.

## Boundary

- Vibe-level concepts: lanes, providers, routes, handoffs, write scopes, validation gates, memory, human approval, and generated artifacts.
- Adapter-level packaging: `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, Claude skills/agents, `.mcp.json`, VS Code extension manifests, GitHub workflow files, local CLI commands, and cloud-agent configuration.

Keep the Vibe-level contract stable enough to project into multiple adapters. Let each adapter own its own manifest, permissions, authentication timing, UI metadata, and runtime quirks.

## Practical Rule

When adding a new workflow helper, first describe the portable contract:

- What source file or plan does it read?
- What write scope does it own?
- What handoff target does it serve?
- What validation gate proves it worked?
- What human approval is required?

Then add the adapter packaging needed for Codex, Claude Code, MCP, IDEs, GitHub, or another surface.
