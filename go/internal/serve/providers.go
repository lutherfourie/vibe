package serve

import (
	"context"
	"log"
	"os"

	"github.com/lutherfourie/vibe/go/agent"
	"github.com/lutherfourie/vibe/go/agent/adapters/openai"
	"github.com/lutherfourie/vibe/go/internal/resource"
)

func openAICompatibleProviders() map[string]ProviderFactory {
	// Ensure/notify for Cerebras GLM (zai-glm-4.7) as requested: if config forces it or we prefer it,
	// require the key or notify loudly instead of silent failure downstream.
	forceCerebras := os.Getenv("FORCE_CEREBRAS") == "true" || os.Getenv("DEFAULT_PROVIDER") == "cerebras"
	hasCerebrasKey := os.Getenv("CEREBRAS_API_KEY") != ""
	if forceCerebras && !hasCerebrasKey {
		log.Printf("[Vibe Serve] ERROR: FORCE_CEREBRAS or DEFAULT_PROVIDER=cerebras but CEREBRAS_API_KEY not set. Real Cerebras GLM will fail.")
		// In production you might os.Exit(1) or refuse to start the cerebras entry.
	}
	if !hasCerebrasKey {
		log.Printf("[Vibe Serve] WARN: CEREBRAS_API_KEY not configured. 'cerebras' provider will not be usable for real calls (only if key added).")
	}

	// Consult resource dispatcher for economical default before registering providers.
	// This wires CLI/external delegation to the dispatcher (task 4/5).
	if rec, err := resource.NewResourceAwareDispatcher().Recommend(context.Background(), resource.TaskEstimate{EstimatedTokens: 50000, Complexity: "medium"}); err == nil && rec.Provider != "" && rec.Provider != "none" {
		resource.LogDecision(rec, "serve openAICompatibleProviders init")
		// In fuller impl, prefer rec.Provider for default or filter the map.
	}

	return map[string]ProviderFactory{
		"openai": func() agent.Provider {
			return openai.New(openai.Config{
				BaseURL: envOrDefault("OPENAI_BASE_URL", "https://api.openai.com/v1"),
				Model:   os.Getenv("OPENAI_MODEL"),
				APIKey:  os.Getenv("OPENAI_API_KEY"),
			})
		},
		"cerebras": func() agent.Provider {
			return openai.New(openai.Config{
				BaseURL: envOrDefault("CEREBRAS_BASE_URL", "https://api.cerebras.ai/v1"),
				Model:   envOrDefault("CEREBRAS_MODEL", "zai-glm-4.7"),
				APIKey:  os.Getenv("CEREBRAS_API_KEY"),
			})
		},
	}
}

func envOrDefault(name, fallback string) string {
	value := os.Getenv(name)
	if value == "" {
		return fallback
	}
	return value
}
