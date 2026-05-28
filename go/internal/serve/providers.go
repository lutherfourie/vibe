package serve

import (
	"os"

	"github.com/lutherfourie/vibe/go/agent"
	"github.com/lutherfourie/vibe/go/agent/adapters/openai"
)

func openAICompatibleProviders() map[string]ProviderFactory {
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
