package config

import (
	"encoding/json"
	"fmt"
	"os"
)

type Config struct {
	DefaultProvider string            `json:"defaultProvider"`
	Providers       []ProviderConfig  `json:"providers"`
	MCPServers      []MCPServerConfig `json:"mcpServers"`
}

type ProviderConfig struct {
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	BaseURL   string `json:"baseUrl,omitempty"`
	Model     string `json:"model,omitempty"`
	APIKeyEnv string `json:"apiKeyEnv,omitempty"`
}

type MCPServerConfig struct {
	Name    string   `json:"name"`
	Command string   `json:"command"`
	Args    []string `json:"args,omitempty"`
	Env     []string `json:"env,omitempty"`
}

func Load(path string) (Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("load config %q: %w", path, err)
	}
	return Parse(data)
}

func Parse(data []byte) (Config, error) {
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return Config{}, fmt.Errorf("parse config JSON: %w", err)
	}
	if err := cfg.Validate(); err != nil {
		return Config{}, fmt.Errorf("validate config: %w", err)
	}
	return cfg, nil
}

func (c Config) Validate() error {
	providers := map[string]struct{}{}
	for i, provider := range c.Providers {
		if provider.Name == "" {
			return fmt.Errorf("provider at index %d has empty name", i)
		}
		if provider.Kind == "" {
			return fmt.Errorf("provider %q has empty kind", provider.Name)
		}
		if !validProviderKind(provider.Kind) {
			return fmt.Errorf("provider %q has unknown kind %q", provider.Name, provider.Kind)
		}
		if _, ok := providers[provider.Name]; ok {
			return fmt.Errorf("duplicate provider name %q", provider.Name)
		}
		providers[provider.Name] = struct{}{}
	}

	if c.DefaultProvider != "" {
		if _, ok := providers[c.DefaultProvider]; !ok {
			return fmt.Errorf("defaultProvider %q does not match any provider", c.DefaultProvider)
		}
	}

	servers := map[string]struct{}{}
	for i, server := range c.MCPServers {
		if server.Name == "" {
			return fmt.Errorf("mcp server at index %d has empty name", i)
		}
		if server.Command == "" {
			return fmt.Errorf("mcp server %q has empty command", server.Name)
		}
		if _, ok := servers[server.Name]; ok {
			return fmt.Errorf("duplicate mcp server name %q", server.Name)
		}
		servers[server.Name] = struct{}{}
	}

	return nil
}

func validProviderKind(kind string) bool {
	switch kind {
	case "fake", "claude", "codex", "openai":
		return true
	default:
		return false
	}
}
