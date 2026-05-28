package serve

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"

	"github.com/lutherfourie/vibe/go/agent"
	"github.com/lutherfourie/vibe/go/agent/adapters/claude"
)

const (
	DefaultAddr     = "127.0.0.1:8787"
	DefaultProvider = "fake"
)

// ProviderFactory constructs a fresh provider for one daemon turn.
type ProviderFactory func() agent.Provider

// Options configures the daemon HTTP routes.
type Options struct {
	DefaultProvider string
	Providers       map[string]ProviderFactory
}

// Daemon serves the provider-neutral turn API.
type Daemon struct {
	defaultProvider string
	providers       map[string]ProviderFactory

	mu       sync.RWMutex
	sessions map[string]string
}

type turnRequest struct {
	SessionID string          `json:"sessionId,omitempty"`
	Messages  []agent.Message `json:"messages"`
	Provider  string          `json:"provider,omitempty"`
}

type sessionProvider interface {
	SessionID() string
}

// DefaultProviders returns the built-in provider registry.
func DefaultProviders() map[string]ProviderFactory {
	providers := map[string]ProviderFactory{
		"fake": func() agent.Provider {
			return agent.FakeProvider{}
		},
		"claude": func() agent.Provider {
			return claude.New()
		},
	}
	for name, factory := range openAICompatibleProviders() {
		providers[name] = factory
	}
	return providers
}

// NewDaemon returns a daemon with validated provider configuration.
func NewDaemon(opts Options) (*Daemon, error) {
	providers := opts.Providers
	if providers == nil {
		providers = DefaultProviders()
	}
	providers = normalizeProviders(providers)

	defaultProvider := normalizeProviderName(opts.DefaultProvider)
	if defaultProvider == "" {
		defaultProvider = DefaultProvider
	}
	if _, ok := providers[defaultProvider]; !ok {
		return nil, fmt.Errorf("unknown provider %q", defaultProvider)
	}

	return &Daemon{
		defaultProvider: defaultProvider,
		providers:       providers,
		sessions:        make(map[string]string),
	}, nil
}

// NewHandler returns a standalone mux containing the daemon routes.
func NewHandler(opts Options) (http.Handler, error) {
	daemon, err := NewDaemon(opts)
	if err != nil {
		return nil, err
	}
	mux := http.NewServeMux()
	daemon.Register(mux)
	return mux, nil
}

// Register attaches daemon routes to mux.
func (d *Daemon) Register(mux *http.ServeMux) {
	mux.HandleFunc("/healthz", d.handleHealthz)
	mux.HandleFunc("/v1/providers", d.handleProviders)
	mux.HandleFunc("/v1/turn", d.handleTurn)
}

func (d *Daemon) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok\n"))
}

func (d *Daemon) handleProviders(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"providers": d.providerNames(),
		"default":   d.defaultProvider,
	})
}

func (d *Daemon) handleTurn(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req turnRequest
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if err := validateTurnRequest(req); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	providerName := normalizeProviderName(req.Provider)
	if providerName == "" {
		providerName = d.defaultProvider
	}
	provider, err := d.newProvider(providerName)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	events, err := provider.RunTurn(r.Context(), agent.TurnRequest{
		SessionID: d.providerSessionID(req.SessionID),
		Messages:  req.Messages,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	terminal := false
	for event := range events {
		if terminal {
			continue
		}
		if err := writeSSE(w, event); err != nil {
			return
		}
		flusher.Flush()
		if isTerminal(event) {
			terminal = true
		}
	}

	if sessionProvider, ok := provider.(sessionProvider); ok {
		d.rememberProviderSessionID(req.SessionID, sessionProvider.SessionID())
	}
}

func (d *Daemon) providerNames() []string {
	names := make([]string, 0, len(d.providers))
	for name := range d.providers {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func (d *Daemon) newProvider(name string) (agent.Provider, error) {
	factory, ok := d.providers[name]
	if !ok {
		return nil, fmt.Errorf("unknown provider %q", name)
	}
	provider := factory()
	if provider == nil {
		return nil, fmt.Errorf("provider %q returned nil", name)
	}
	return provider, nil
}

func (d *Daemon) providerSessionID(clientSessionID string) string {
	if clientSessionID == "" {
		return ""
	}
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.sessions[clientSessionID]
}

func (d *Daemon) rememberProviderSessionID(clientSessionID, providerSessionID string) {
	if clientSessionID == "" || providerSessionID == "" {
		return
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	d.sessions[clientSessionID] = providerSessionID
}

func validateTurnRequest(req turnRequest) error {
	if len(req.Messages) == 0 {
		return fmt.Errorf("messages must not be empty")
	}
	for i, message := range req.Messages {
		if strings.TrimSpace(string(message.Role)) == "" {
			return fmt.Errorf("messages[%d].role must not be empty", i)
		}
		if strings.TrimSpace(message.Content) == "" {
			return fmt.Errorf("messages[%d].content must not be empty", i)
		}
	}
	return nil
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeSSE(w http.ResponseWriter, event agent.Event) error {
	raw, err := json.Marshal(event)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(w, "data: %s\n\n", raw)
	return err
}

func isTerminal(event agent.Event) bool {
	return event.Kind == agent.EventKindDone || event.Kind == agent.EventKindError
}

func normalizeProviders(providers map[string]ProviderFactory) map[string]ProviderFactory {
	normalized := make(map[string]ProviderFactory, len(providers))
	for name, factory := range providers {
		normalized[normalizeProviderName(name)] = factory
	}
	return normalized
}

func normalizeProviderName(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}
