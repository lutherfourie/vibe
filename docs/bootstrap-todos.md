# Bootstrap Todos

**Status:** Active bootstrap checklist
**Date:** 2026-05-16
**Source of truth:** `C:\vibe`

These todos are local-environment and project-bootstrap work. They should become
inputs to `vibe doctor` once the local toolkit exists.

## Tooling And Auth

- [x] Make sure `gh` is installed and authenticated.
- [x] Install or verify Playwright browsers.
- [x] Add `jq`, `yq`, and `fd`.
- [x] Configure GitHub and Browser plugins/connectors for the Vibe work loop.
- [ ] Configure OpenAI runtime credentials for shell/API work.

## Verified State

- `gh` 2.87.3 is installed and authenticated as `lutherfourie`.
- `jq` 1.8.1 is installed.
- `yq` 4.53.2 is installed.
- `fd` 10.4.2 is installed.
- Playwright CLI 1.60.0 is available through `pnpm dlx`.
- Playwright Chromium, Firefox, and WebKit browsers launch successfully.
- GitHub connector access is working.
- Browser/Playwright connector access is working.
- OpenAI docs/platform connector access is available, but `OPENAI_API_KEY` is
  not set in the current shell.

## Notes

- Treat plugins/connectors as execution surfaces, not hard dependencies of the
  source format.
- Keep setup checks report-only until a human chooses to install or authenticate
  a tool.
- Record durable project decisions in repo docs or `.vibe` source before
  expecting agents to remember them.
