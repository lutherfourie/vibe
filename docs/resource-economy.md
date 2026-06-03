# Resource Economy Research (initial)

## Provider Pricing (approximate as of 2026, for demo; update from real APIs)
- Grok (xAI): ~$0.50 / M tokens (fast, cheap, good for simple tasks)
- Cerebras: ~$0.10 / M (very fast inference, limited models)
- Claude (Anthropic): ~$3 / M (strong reasoning, higher cost)
- Codex/OpenAI: ~$2 / M (good code, variable)
- big-AGI: ~$1.50 / M (multi-model fanout, higher effective)

## Quota Models
- Many reset monthly or have burst limits.
- Track remaining, reset_at, cost_per_million in Supabase.
- Priority: lower number preferred for same cost.

## Current Vibe Usage Patterns (from history/logs)
- Heavy on long-horizon autonomous: research heavy -> higher token use.
- Demo launches use ~10k-100k tokens per step.
- Previous credential work used local mocks + some real.

## Recommendation Logic
See dispatcher.go: score = est_cost + (priority * 0.01) - (remaining_frac * 0.5)
Prefers low cost + high remaining quota + low priority.

## Next
- Add real quota fetch/update from provider APIs if keys available.
- Persist usage after each delegation.
- Integrate in serve/providers.go and handoff more deeply.
- Dashboard to show current quotas.
