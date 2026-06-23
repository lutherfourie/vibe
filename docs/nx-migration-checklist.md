# Vibe Monorepo: Nx Migration / Exploration Checklist

## Phase 0: Decision (Done?)
- [ ] Confirm need: Generators for new vibe components/lanes? Advanced graph for agents? Go plugin? Scale beyond 10 packages?
- [ ] Current Turbo sufficient? (Yes for now — keep both during trial)

## Phase 1: Safe Trial Setup (15-30 mins)
1. `pnpm add nx @nx/js @nx/eslint -D -w`
2. `npx nx init` (answers: pnpm, keep existing scripts)
3. Add `nx.json` (see previous draft)
4. Create `project.json` for key packages (e.g. packages/language/project.json)
5. `nx graph` — verify visualization works
6. Test: `nx affected:build --base=HEAD~1`

## Phase 2: Migration Steps
- [ ] Update root scripts to prefer `nx run-many` or `nx run`
- [ ] Add generators: `nx g @nx/js:lib` test + custom `vibe:agent-lane`
- [ ] Configure targets in project.json or inferred
- [ ] Go support: Add community Go plugin or custom executors
- [ ] CI: Update .github/workflows to use `nx affected`
- [ ] Remote cache: Connect Nx Cloud
- [ ] Vibe integration: Make self:plan output project graph updates or use Nx as exec target

## Phase 3: Full Switch or Hybrid
- Decide: Hybrid (recommended initially) vs Full Nx (remove Turbo)
- Benefits validation: Measure build times, agent productivity gains
- Polish: IDE extension, custom Nx plugins for vibecode

## Risks / Notes
- Nx adds config overhead but massive leverage for agentic self-management.
- Reversible — git revert easy.
- Vibe advantage: Your agents can be taught to run `nx g` commands autonomously.

Commit this checklist after review. Run steps sequentially.