package serve

import (
	"bufio"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/lutherfourie/vibe/go/agent"
)

func TestHealthzReturnsOK(t *testing.T) {
	handler, err := NewHandler(Options{
		Providers: map[string]ProviderFactory{
			"fake": func() agent.Provider { return agent.FakeProvider{} },
		},
	})
	if err != nil {
		t.Fatalf("NewHandler returned error: %v", err)
	}

	server := httptest.NewServer(handler)
	defer server.Close()

	client := http.Client{Timeout: time.Second}
	resp, err := client.Get(server.URL + "/healthz")
	if err != nil {
		t.Fatalf("GET /healthz returned error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusOK)
	}
}

func TestProvidersReturnsRegisteredProvidersAndDefault(t *testing.T) {
	handler, err := NewHandler(Options{
		DefaultProvider: "fake",
		Providers: map[string]ProviderFactory{
			// "claude" omitted here too (temporarily disabled in main DefaultProviders)
			"fake": func() agent.Provider { return agent.FakeProvider{} },
		},
	})
	if err != nil {
		t.Fatalf("NewHandler returned error: %v", err)
	}

	server := httptest.NewServer(handler)
	defer server.Close()

	client := http.Client{Timeout: time.Second}
	resp, err := client.Get(server.URL + "/v1/providers")
	if err != nil {
		t.Fatalf("GET /v1/providers returned error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusOK)
	}

	var got struct {
		Providers []string `json:"providers"`
		Default   string   `json:"default"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	wantProviders := []string{"fake"} // claude temporarily disabled (see serve.go DefaultProviders); codex/grok via other paths
	if !reflect.DeepEqual(got.Providers, wantProviders) {
		t.Fatalf("providers = %#v, want %#v", got.Providers, wantProviders)
	}
	if got.Default != "fake" {
		t.Fatalf("default = %q, want %q", got.Default, "fake")
	}
}

func TestProvidersReturnsDefaultOpenAICompatibleProviders(t *testing.T) {
	handler, err := NewHandler(Options{})
	if err != nil {
		t.Fatalf("NewHandler returned error: %v", err)
	}

	server := httptest.NewServer(handler)
	defer server.Close()

	client := http.Client{Timeout: time.Second}
	resp, err := client.Get(server.URL + "/v1/providers")
	if err != nil {
		t.Fatalf("GET /v1/providers returned error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusOK)
	}

	var got struct {
		Providers []string `json:"providers"`
		Default   string   `json:"default"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	wantProviders := []string{"cerebras", "fake", "openai"} // "claude" temporarily disabled to avoid interfering with another local project using claude CLI
	if !reflect.DeepEqual(got.Providers, wantProviders) {
		t.Fatalf("providers = %#v, want %#v", got.Providers, wantProviders)
	}
	if got.Default != "fake" {
		t.Fatalf("default = %q, want %q", got.Default, "fake")
	}
}

func TestCerebrasDefaultProviderConstructsOpenAIProvider(t *testing.T) {
	daemon, err := NewDaemon(Options{DefaultProvider: "cerebras"})
	if err != nil {
		t.Fatalf("NewDaemon returned error: %v", err)
	}

	provider, err := daemon.newProvider(daemon.defaultProvider)
	if err != nil {
		t.Fatalf("newProvider returned error: %v", err)
	}
	if got, want := provider.Name(), "openai"; got != want {
		t.Fatalf("provider.Name() = %q, want %q", got, want)
	}
}

func TestTurnRejectsInvalidRequests(t *testing.T) {
	handler, err := NewHandler(Options{
		DefaultProvider: "fake",
		Providers: map[string]ProviderFactory{
			"fake": func() agent.Provider { return agent.FakeProvider{} },
		},
	})
	if err != nil {
		t.Fatalf("NewHandler returned error: %v", err)
	}

	server := httptest.NewServer(handler)
	defer server.Close()

	tests := []struct {
		name string
		body string
	}{
		{
			name: "empty messages",
			body: `{"messages":[]}`,
		},
		{
			name: "empty message role",
			body: `{"messages":[{"role":"","content":"hello"}]}`,
		},
		{
			name: "empty message content",
			body: `{"messages":[{"role":"user","content":""}]}`,
		},
		{
			name: "unknown provider",
			body: `{"provider":"missing","messages":[{"role":"user","content":"hello"}]}`,
		},
	}

	client := http.Client{Timeout: time.Second}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := http.NewRequest(http.MethodPost, server.URL+"/v1/turn", strings.NewReader(tt.body))
			if err != nil {
				t.Fatalf("NewRequest returned error: %v", err)
			}
			req.Header.Set("Content-Type", "application/json")

			resp, err := client.Do(req)
			if err != nil {
				t.Fatalf("POST /v1/turn returned error: %v", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusBadRequest)
			}

			var got struct {
				Error string `json:"error"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
				t.Fatalf("decode error body: %v", err)
			}
			if got.Error == "" {
				t.Fatalf("error body missing error message")
			}
		})
	}
}

func TestTurnStreamsFakeProviderEventsInOrder(t *testing.T) {
	handler, err := NewHandler(Options{
		DefaultProvider: "fake",
		Providers: map[string]ProviderFactory{
			"fake": func() agent.Provider { return agent.FakeProvider{} },
		},
	})
	if err != nil {
		t.Fatalf("NewHandler returned error: %v", err)
	}

	server := httptest.NewServer(handler)
	defer server.Close()

	body := strings.NewReader(`{"sessionId":"client-1","messages":[{"role":"user","content":"hello from vibe"}]}`)
	req, err := http.NewRequest(http.MethodPost, server.URL+"/v1/turn", body)
	if err != nil {
		t.Fatalf("NewRequest returned error: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := http.Client{Timeout: time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("POST /v1/turn returned error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusOK)
	}
	if got, want := resp.Header.Get("Content-Type"), "text/event-stream"; got != want {
		t.Fatalf("Content-Type = %q, want %q", got, want)
	}

	events := readSSEEvents(t, resp)
	kinds := make([]agent.EventKind, 0, len(events))
	var text strings.Builder
	for _, event := range events {
		kinds = append(kinds, event.Kind)
		if event.Kind == agent.EventKindTextDelta {
			text.WriteString(event.Text)
		}
	}

	wantKinds := []agent.EventKind{
		agent.EventKindTextDelta,
		agent.EventKindTextDelta,
		agent.EventKindUsage,
		agent.EventKindDone,
	}
	if !reflect.DeepEqual(kinds, wantKinds) {
		t.Fatalf("event kinds = %#v, want %#v", kinds, wantKinds)
	}
	if got, want := text.String(), "hello from vibe"; got != want {
		t.Fatalf("assembled text = %q, want %q", got, want)
	}
	if events[2].Usage == nil {
		t.Fatalf("usage event payload is nil")
	}
}

func readSSEEvents(t *testing.T, resp *http.Response) []agent.Event {
	t.Helper()

	var events []agent.Event
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		const prefix = "data: "
		if !strings.HasPrefix(line, prefix) {
			t.Fatalf("unexpected SSE line %q", line)
		}
		var event agent.Event
		if err := json.Unmarshal([]byte(strings.TrimPrefix(line, prefix)), &event); err != nil {
			t.Fatalf("unmarshal event %q: %v", line, err)
		}
		events = append(events, event)
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("read SSE stream: %v", err)
	}
	return events
}
