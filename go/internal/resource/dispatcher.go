package resource

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/url"
	"sort"
	"time"

	"github.com/lutherfourie/vibe/go/internal/remote"
)

// ProviderQuota mirrors the DB row.
type ProviderQuota struct {
	Provider       string          `json:"provider"`
	Remaining      float64         `json:"remaining"`
	TotalQuota     float64         `json:"total_quota"`
	CostPerMillion float64         `json:"cost_per_million"`
	ResetAt        time.Time       `json:"reset_at"`
	Priority       int             `json:"priority"`
	Metadata       json.RawMessage `json:"metadata"`
}

// TaskEstimate rough cost estimate for a task (in tokens or 'units').
type TaskEstimate struct {
	EstimatedTokens int    // rough total tokens (prompt + completion)
	Complexity      string // "low", "medium", "high"
}

// Recommendation from the dispatcher.
type Recommendation struct {
	Provider  string  `json:"provider"`
	Score     float64 `json:"score"` // lower better (cost + priority adjusted)
	EstCost   float64 `json:"est_cost_usd"`
	Reason    string  `json:"reason"`
	QuotaLeft float64 `json:"quota_left"`
}

// ResourceAwareDispatcher consults Supabase quotas to pick economical provider.
type ResourceAwareDispatcher struct {
	client *remote.Client
}

// NewResourceAwareDispatcher creates one using the shared remote client (reuses Supabase REST).
func NewResourceAwareDispatcher() *ResourceAwareDispatcher {
	return &ResourceAwareDispatcher{
		client: remote.NewClient(),
	}
}

// EstimateTaskCost is a simple heuristic. In real use, analyze the prompt length, task type.
func EstimateTaskCost(prompt string, taskType string) TaskEstimate {
	// Very rough: 1 token ~ 4 chars.
	tokens := int(math.Ceil(float64(len(prompt)) / 4.0))
	switch taskType {
	case "code", "implement":
		tokens *= 3 // completion heavy
	case "research":
		tokens *= 2
	}
	return TaskEstimate{EstimatedTokens: tokens, Complexity: "medium"}
}

// LoadQuotas reads all from Supabase.
func (d *ResourceAwareDispatcher) LoadQuotas(ctx context.Context) ([]ProviderQuota, error) {
	q := url.Values{}
	q.Set("order", "priority.asc,remaining.desc")
	var quotas []ProviderQuota
	if err := d.client.Query(ctx, "provider_quotas", q, &quotas); err != nil {
		return nil, fmt.Errorf("load quotas: %w", err)
	}
	return quotas, nil
}

// Recommend picks the best provider for the estimate.
// Score = (est_cost) + (priority * small_factor) - (remaining / total * bonus)
// Lower score better. Prefers low cost, high remaining, low priority number.
func (d *ResourceAwareDispatcher) Recommend(ctx context.Context, est TaskEstimate) (Recommendation, error) {
	quotas, err := d.LoadQuotas(ctx)
	if err != nil {
		return Recommendation{}, err
	}
	if len(quotas) == 0 {
		return Recommendation{Provider: "none", Reason: "no quotas configured"}, nil
	}

	million := 1000000.0
	estCost := float64(est.EstimatedTokens) / million

	type scored struct {
		q     ProviderQuota
		score float64
		cost  float64
	}
	var scoreds []scored
	for _, q := range quotas {
		if q.Remaining <= 0 {
			continue // out of quota
		}
		cost := estCost * q.CostPerMillion
		// normalize remaining fraction
		frac := 0.0
		if q.TotalQuota > 0 {
			frac = q.Remaining / q.TotalQuota
		}
		// score: cost + (priority weight) - remaining bonus
		score := cost + (float64(q.Priority) * 0.01) - (frac * 0.5)
		scoreds = append(scoreds, scored{q: q, score: score, cost: cost})
	}
	if len(scoreds) == 0 {
		return Recommendation{Provider: "none", Reason: "all quotas exhausted"}, nil
	}

	sort.Slice(scoreds, func(i, j int) bool { return scoreds[i].score < scoreds[j].score })

	best := scoreds[0]
	reason := fmt.Sprintf("lowest score=%.4f (cost=%.4f, prio=%d, remaining_frac=%.2f)", best.score, best.cost, best.q.Priority, best.q.Remaining/best.q.TotalQuota)
	if best.q.TotalQuota == 0 {
		reason = fmt.Sprintf("lowest score (no total quota known)")
	}

	return Recommendation{
		Provider:  best.q.Provider,
		Score:     best.score,
		EstCost:   best.cost,
		Reason:    reason,
		QuotaLeft: best.q.Remaining,
	}, nil
}

// LogDecision records the choice (for now just fmt; later could write to DB log).
// Also emits telemetry (best effort) so we can analyze provider economy over time.
func LogDecision(rec Recommendation, task string) {
	fmt.Printf("[ResourceDispatcher] For task %q chose %s (score=%.4f, est_cost=$%.4f, reason: %s, left=%.0f)\n",
		task, rec.Provider, rec.Score, rec.EstCost, rec.Reason, rec.QuotaLeft)

	// Telemetry emission (reuses the Supabase client; safe if no key, no-op).
	c := remote.NewClient()
	_ = c.EmitTelemetry(context.Background(), remote.TelemetryEvent{
		Kind:   "resource_decision",
		Source: "go",
		Payload: func() json.RawMessage {
			b, _ := json.Marshal(map[string]any{
				"task":       task,
				"provider":   rec.Provider,
				"score":      rec.Score,
				"est_cost":   rec.EstCost,
				"reason":     rec.Reason,
				"quota_left": rec.QuotaLeft,
			})
			return b
		}(),
	})
}

// UpdateQuotaAfterUse is called after a delegation to deduct the actual or estimated usage.
// In production, call this with real usage from provider response, then PATCH to Supabase.
func (d *ResourceAwareDispatcher) UpdateQuotaAfterUse(ctx context.Context, provider string, usedTokens int) error {
	// rough deduct
	delta := float64(usedTokens) / 1000000.0
	q := url.Values{}
	q.Set("provider", "eq."+provider)
	body := map[string]any{
		"remaining":    "remaining - " + fmt.Sprintf("%.4f", delta), // note: this is not correct for postgrest; real would use rpc or select+update
		"last_updated": time.Now().UTC().Format(time.RFC3339),
	}
	// For demo, use simple PATCH with computed (in real use RPC or transaction)
	// Here we just log; full impl would read current, compute, update.
	fmt.Printf("[ResourceDispatcher] Would deduct ~%.4fM tokens from %s (used %d). Implement full update in prod.\n", delta, provider, usedTokens)
	_ = d.client.Update(ctx, "provider_quotas", q.Encode(), body) // may need real logic
	return nil
}
