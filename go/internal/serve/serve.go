package serve

import (
	"encoding/json"
	"fmt"
	"net/http"
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
	return map[string]ProviderFactory{
		"fake": func() agent.Provider {
			return agent.FakeProvider{}
		},
		"claude": func() agent.Provider {
			return claude.New()
		},
	}
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
	mux.HandleFunc("/v1/turn", d.handleTurn)
}

func (d *Daemon) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok\n"))
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
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}

	providerName := normalizeProviderName(req.Provider)
	if providerName == "" {
		providerName = d.defaultProvider
	}
	provider, err := d.newProvider(providerName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
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
