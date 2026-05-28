package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseValidConfig(t *testing.T) {
	cfg, err := Parse([]byte(`{
		"defaultProvider": "local",
		"providers": [
			{"name": "local", "kind": "fake"},
			{"name": "claude-desktop", "kind": "claude", "model": "sonnet"}
		],
		"mcpServers": [
			{"name": "filesystem", "command": "node", "args": ["server.js"], "env": ["ROOT=C:\\tmp"]}
		]
	}`))
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}

	if cfg.DefaultProvider != "local" {
		t.Fatalf("DefaultProvider = %q, want local", cfg.DefaultProvider)
	}
	if len(cfg.Providers) != 2 {
		t.Fatalf("provider count = %d, want 2", len(cfg.Providers))
	}
	if got := cfg.Providers[0]; got != (ProviderConfig{Name: "local", Kind: "fake"}) {
		t.Fatalf("first provider = %+v, want local fake", got)
	}
	if got := cfg.Providers[1]; got != (ProviderConfig{Name: "claude-desktop", Kind: "claude", Model: "sonnet"}) {
		t.Fatalf("second provider = %+v, want claude-desktop claude sonnet", got)
	}
	if len(cfg.MCPServers) != 1 {
		t.Fatalf("MCP server count = %d, want 1", len(cfg.MCPServers))
	}
	server := cfg.MCPServers[0]
	if server.Name != "filesystem" || server.Command != "node" {
		t.Fatalf("MCP server = %+v, want filesystem node", server)
	}
	if len(server.Args) != 1 || server.Args[0] != "server.js" {
		t.Fatalf("MCP server args = %v, want [server.js]", server.Args)
	}
	if len(server.Env) != 1 || server.Env[0] != `ROOT=C:\tmp` {
		t.Fatalf("MCP server env = %v, want ROOT=C:\\tmp", server.Env)
	}
}

func TestValidateRejectsDuplicateProviderNames(t *testing.T) {
	_, err := Parse([]byte(`{
		"providers": [
			{"name": "local", "kind": "fake"},
			{"name": "local", "kind": "openai"}
		]
	}`))
	if err == nil {
		t.Fatal("Parse returned nil error, want duplicate provider name error")
	}
	if !strings.Contains(err.Error(), `duplicate provider name "local"`) {
		t.Fatalf("error = %q, want duplicate provider name", err)
	}
}

func TestValidateRejectsUnknownProviderKind(t *testing.T) {
	_, err := Parse([]byte(`{"providers": [{"name": "local", "kind": "ollama"}]}`))
	if err == nil {
		t.Fatal("Parse returned nil error, want unknown provider kind error")
	}
	if !strings.Contains(err.Error(), `provider "local" has unknown kind "ollama"`) {
		t.Fatalf("error = %q, want unknown provider kind", err)
	}
}

func TestValidateRejectsUnknownDefaultProvider(t *testing.T) {
	_, err := Parse([]byte(`{
		"defaultProvider": "missing",
		"providers": [{"name": "local", "kind": "fake"}]
	}`))
	if err == nil {
		t.Fatal("Parse returned nil error, want missing default provider error")
	}
	if !strings.Contains(err.Error(), `defaultProvider "missing" does not match any provider`) {
		t.Fatalf("error = %q, want missing default provider", err)
	}
}

func TestValidateRejectsMCPServerMissingCommand(t *testing.T) {
	_, err := Parse([]byte(`{
		"providers": [{"name": "local", "kind": "fake"}],
		"mcpServers": [{"name": "filesystem"}]
	}`))
	if err == nil {
		t.Fatal("Parse returned nil error, want missing MCP command error")
	}
	if !strings.Contains(err.Error(), `mcp server "filesystem" has empty command`) {
		t.Fatalf("error = %q, want missing MCP command", err)
	}
}

func TestLoadTempFileRoundTrips(t *testing.T) {
	path := filepath.Join(t.TempDir(), "vibe-config.json")
	data := []byte(`{
		"defaultProvider": "openai-main",
		"providers": [
			{"name": "openai-main", "kind": "openai", "baseUrl": "https://api.openai.com/v1", "model": "gpt-5.5", "apiKeyEnv": "OPENAI_API_KEY"}
		],
		"mcpServers": [
			{"name": "tools", "command": "vibe-mcp", "args": ["serve"]}
		]
	}`)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}

	if cfg.DefaultProvider != "openai-main" {
		t.Fatalf("DefaultProvider = %q, want openai-main", cfg.DefaultProvider)
	}
	if len(cfg.Providers) != 1 {
		t.Fatalf("provider count = %d, want 1", len(cfg.Providers))
	}
	provider := cfg.Providers[0]
	if provider.Name != "openai-main" || provider.Kind != "openai" {
		t.Fatalf("provider = %+v, want openai-main openai", provider)
	}
	if provider.BaseURL != "https://api.openai.com/v1" || provider.Model != "gpt-5.5" || provider.APIKeyEnv != "OPENAI_API_KEY" {
		t.Fatalf("provider optional fields = %+v, want baseUrl/model/apiKeyEnv", provider)
	}
	if len(cfg.MCPServers) != 1 {
		t.Fatalf("MCP server count = %d, want 1", len(cfg.MCPServers))
	}
	server := cfg.MCPServers[0]
	if server.Name != "tools" || server.Command != "vibe-mcp" {
		t.Fatalf("MCP server = %+v, want tools vibe-mcp", server)
	}
	if len(server.Args) != 1 || server.Args[0] != "serve" {
		t.Fatalf("MCP server args = %v, want [serve]", server.Args)
	}
}
