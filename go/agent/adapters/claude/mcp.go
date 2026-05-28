package claude

import (
	"encoding/json"
	"os"
	"strings"
)

// MCPServerSpec describes an MCP server that Claude CLI should host.
type MCPServerSpec struct {
	Name    string
	Command string
	Args    []string
	Env     []string
}

type mcpConfig struct {
	MCPServers map[string]mcpServerConfig `json:"mcpServers"`
}

type mcpServerConfig struct {
	Command string            `json:"command"`
	Args    []string          `json:"args"`
	Env     map[string]string `json:"env"`
}

func (p *Provider) writeMCPConfig() (string, func(), error) {
	servers := p.configuredMCPServers()
	if len(servers) == 0 {
		return "", func() {}, nil
	}

	file, err := os.CreateTemp("", "vibe-claude-mcp-*.json")
	if err != nil {
		return "", func() {}, err
	}

	path := file.Name()
	cleanup := func() {
		_ = os.Remove(path)
	}

	if err := json.NewEncoder(file).Encode(mcpConfigForServers(servers)); err != nil {
		_ = file.Close()
		cleanup()
		return "", func() {}, err
	}
	if err := file.Close(); err != nil {
		cleanup()
		return "", func() {}, err
	}

	return path, cleanup, nil
}

func (p *Provider) configuredMCPServers() []MCPServerSpec {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return cloneMCPServerSpecs(p.mcpServers)
}

func mcpConfigForServers(servers []MCPServerSpec) mcpConfig {
	config := mcpConfig{
		MCPServers: make(map[string]mcpServerConfig, len(servers)),
	}
	for _, server := range servers {
		args := cloneStringSlice(server.Args)
		if args == nil {
			args = []string{}
		}
		config.MCPServers[server.Name] = mcpServerConfig{
			Command: server.Command,
			Args:    args,
			Env:     mcpEnvMap(server.Env),
		}
	}
	return config
}

func mcpEnvMap(entries []string) map[string]string {
	env := make(map[string]string, len(entries))
	for _, entry := range entries {
		key, value, ok := strings.Cut(entry, "=")
		if !ok {
			env[entry] = ""
			continue
		}
		env[key] = value
	}
	return env
}

func cloneMCPServerSpecs(servers []MCPServerSpec) []MCPServerSpec {
	if len(servers) == 0 {
		return nil
	}
	cloned := make([]MCPServerSpec, len(servers))
	for i, server := range servers {
		cloned[i] = server
		cloned[i].Args = cloneStringSlice(server.Args)
		cloned[i].Env = cloneStringSlice(server.Env)
	}
	return cloned
}

func cloneStringSlice(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	cloned := make([]string, len(values))
	copy(cloned, values)
	return cloned
}
