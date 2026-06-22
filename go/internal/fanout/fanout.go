// Package fanout runs one prompt across multiple agent providers concurrently
// (multi-subagent fan-out) and summarizes the results. It is the reusable core
// behind `vibe fanout` and the foundation for the continuous dev-pool (M3); see
// docs/adr/0001-continuous-fanout-dev-pool.md.
//
// The registry here intentionally includes the CLI subagents (codex, grok-cli)
// alongside the OpenAI-compatible HTTP providers, because the dev-pool model
// delegates real work to mature external agents. It is deliberately SEPARATE
// from internal/serve's daemon registry (which powers /v1/turn and carries its
// own warn-logging + dispatcher side-effects), so fan-out construction stays
// pure and side-effect-free (and unit-testable without Supabase/network).
package fanout

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"

	"github.com/lutherfourie/vibe/go/agent"
	"github.com/lutherfourie/vibe/go/agent/adapters/codex"
	"github.com/lutherfourie/vibe/go/agent/adapters/grokcli"
	"github.com/lutherfourie/vibe/go/agent/adapters/openai"
)

// Factory builds a fresh provider for one fan-out turn.
type Factory = func() agent.Provider

// Factories returns the provider registry available to fan-out, keyed by the
// name a user types. Construction is cheap and side-effect-free; a missing API
// key or absent CLI binary only surfaces as a per-provider error at RunTurn time
// (never a panic), so an unavailable provider simply yields an errored result.
func Factories() map[string]Factory {
	return map[string]Factory{
		"fake": func() agent.Provider { return agent.FakeProvider{} },
		"cerebras": func() agent.Provider {
			return openai.New(openai.Config{
				BaseURL: env("CEREBRAS_BASE_URL", "https://api.cerebras.ai/v1"),
				Model:   env("CEREBRAS_MODEL", "zai-glm-4.7"),
				APIKey:  os.Getenv("CEREBRAS_API_KEY"),
			})
		},
		"openai": func() agent.Provider {
			return openai.New(openai.Config{
				BaseURL: env("OPENAI_BASE_URL", "https://api.openai.com/v1"),
				Model:   os.Getenv("OPENAI_MODEL"),
				APIKey:  os.Getenv("OPENAI_API_KEY"),
			})
		},
		"grok": func() agent.Provider {
			return openai.New(openai.Config{
				BaseURL: env("GROK_BASE_URL", "https://api.x.ai/v1"),
				Model:   env("GROK_MODEL", "grok-3"),
				APIKey:  grokKey(),
			})
		},
		"grok-cli": func() agent.Provider { return grokcli.New() },
		"codex":    func() agent.Provider { return codex.New() },
	}
}

// Names returns the sorted registry keys (for help text + error messages).
func Names() []string {
	reg := Factories()
	out := make([]string, 0, len(reg))
	for k := range reg {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// Resolve maps provider names to constructed providers, returning the cleaned
// canonical labels in the SAME order. It errors on any unknown name so a typo
// fails fast instead of silently dropping a subagent.
//
// Labels matter because several providers share an adapter Name() (cerebras,
// grok and openai all report "openai"); callers should label results by these
// registry keys, not by provider.Name().
func Resolve(names []string) (providers []agent.Provider, labels []string, err error) {
	reg := Factories()
	var missing []string
	for _, raw := range names {
		name := strings.ToLower(strings.TrimSpace(raw))
		if name == "" {
			continue
		}
		factory, ok := reg[name]
		if !ok {
			missing = append(missing, name)
			continue
		}
		providers = append(providers, factory())
		labels = append(labels, name)
	}
	if len(missing) > 0 {
		return nil, nil, fmt.Errorf("unknown provider(s): %s (known: %s)", strings.Join(missing, ", "), strings.Join(Names(), ", "))
	}
	if len(providers) == 0 {
		return nil, nil, fmt.Errorf("no providers given")
	}
	return providers, labels, nil
}

// Result is a JSON-friendly summary of one provider's fan-out turn.
type Result struct {
	Provider  string  `json:"provider"`
	OK        bool    `json:"ok"`
	Err       string  `json:"err,omitempty"`
	Text      string  `json:"text"`
	ElapsedMs int64   `json:"elapsedMs"`
	In        int     `json:"inputTokens,omitempty"`
	Out       int     `json:"outputTokens,omitempty"`
	CostUSD   float64 `json:"costUsd,omitempty"`
	ToolCalls int     `json:"toolCalls,omitempty"`
}

// Summarize converts raw TurnResults into JSON-friendly summaries (input order).
// labels[i] overrides the result's Provider label when present (see Resolve);
// pass nil to fall back to each result's own provider name.
func Summarize(results []agent.TurnResult, labels []string) []Result {
	out := make([]Result, 0, len(results))
	for i, r := range results {
		label := r.Provider
		if i < len(labels) && strings.TrimSpace(labels[i]) != "" {
			label = labels[i]
		}
		res := Result{
			Provider:  label,
			OK:        r.Err == nil,
			Text:      r.Text,
			ElapsedMs: r.Elapsed.Milliseconds(),
			In:        r.Usage.InputTokens,
			Out:       r.Usage.OutputTokens,
			CostUSD:   r.Usage.CostUSD,
			ToolCalls: r.ToolCalls,
		}
		if r.Err != nil {
			res.Err = r.Err.Error()
		}
		out = append(out, res)
	}
	return out
}

// Render writes a human-readable or JSON report. best is the winning provider
// label ("" if none / not requested).
func Render(w io.Writer, summaries []Result, best string, asJSON bool) error {
	if asJSON {
		enc := json.NewEncoder(w)
		enc.SetIndent("", "  ")
		return enc.Encode(map[string]any{"results": summaries, "best": best})
	}
	fmt.Fprintf(w, "=== fanout: %d provider(s) ===\n", len(summaries))
	for _, s := range summaries {
		status := "ok"
		if !s.OK {
			status = "ERROR"
		}
		fmt.Fprintf(w, "\n[%s] %s %dms", s.Provider, status, s.ElapsedMs)
		if s.In > 0 || s.Out > 0 {
			fmt.Fprintf(w, " (in=%d out=%d)", s.In, s.Out)
		}
		if s.ToolCalls > 0 {
			fmt.Fprintf(w, " toolCalls=%d", s.ToolCalls)
		}
		fmt.Fprintln(w)
		if s.OK {
			fmt.Fprintln(w, strings.TrimRight(s.Text, "\n"))
		} else {
			fmt.Fprintf(w, "  error: %s\n", s.Err)
		}
	}
	if best != "" {
		fmt.Fprintf(w, "\nBEST: %s\n", best)
	}
	return nil
}

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func grokKey() string {
	if k := os.Getenv("GROK_API_KEY"); k != "" {
		return k
	}
	return os.Getenv("XAI_API_KEY")
}
