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
