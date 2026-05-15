package bootstrap

import "github.com/lutherfourie/vibe/go/internal/lanes"

// SelfMakingPlan emits the first Vibe-to-make-Vibe lane plan.
func SelfMakingPlan(repo string) lanes.Plan {
	return lanes.Plan{
		Name: "vibe-self-making-bootstrap",
		Repo: repo,
		Lanes: []lanes.Lane{
			{
				Name: "agentic-iac-research",
				Mode: lanes.ModeCodexWeb,
				Reads: []string{
					"docs/superpowers/specs/2026-05-13-vibe-architecture.md",
					"docs/superpowers/research/2026-05-15-vibe-agentic-iac-framework-map.md",
				},
				Writes: []string{
					"docs/superpowers/research/2026-05-15-vibe-agentic-iac-framework-map.md",
				},
				Prompt: "Refine the Vibe Agentic IaC and framework map. Keep the public naming collision-safe and show where Vibe delegates to major AI frameworks instead of replacing them.",
				Requires: []string{
					"official-docs-refresh",
					"human.review",
				},
			},
			{
				Name: "go-runtime-plan",
				Mode: lanes.ModeCodexWeb,
				Reads: []string{
					"docs/superpowers/plans/2026-05-15-vibe-go-runtime-spike.md",
					"go/README.md",
				},
				Writes: []string{
					"docs/superpowers/plans/2026-05-15-vibe-go-runtime-spike.md",
				},
				Prompt: "Turn the Go runtime spike into an implementation sequence with small, testable milestones. Keep TypeScript/Langium as the language layer.",
				Requires: []string{
					"human.review",
				},
			},
			{
				Name: "go-tooling-bootstrap",
				Mode: lanes.ModeLocal,
				Reads: []string{
					"go/**",
					"docs/examples/pawfall-feedback-lanes.json",
				},
				Writes: []string{
					"go/**",
				},
				Prompt: "Implement and verify the Go bootstrap binaries: vibe-doctor, vibe-make, and vibe-coord. Keep dependencies stdlib-only until the core loop compiles.",
				Requires: []string{
					"go.test",
					"human.merge-review",
				},
			},
			{
				Name: "sd3-init-ts-lane",
				Mode: lanes.ModeLocal,
				Reads: []string{
					"docs/superpowers/specs/2026-05-14-vibe-v0-sd3-init-design.md",
					"docs/superpowers/plans/2026-05-14-vibe-v0-sd3-init.md",
					"packages/language/**",
				},
				Writes: []string{
					"packages/init/**",
					"packages/cli/**",
				},
				Prompt: "Implement the SD3 init/sync TypeScript packages separately from the Go runtime spike. Reuse the existing language and resolver package.",
				Requires: []string{
					"pnpm -r build",
					"pnpm -r test",
					"human.merge-review",
				},
			},
		},
	}
}
