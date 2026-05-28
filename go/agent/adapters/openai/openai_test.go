package openai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/lutherfourie/vibe/go/agent"
)

func TestProviderRunTurnStreamsChatCompletionDeltas(t *testing.T) {
	var requestBody struct {
		Model    string `json:"model"`
		Stream   bool   `json:"stream"`
		Messages []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"messages"`
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		if r.URL.Path != "/chat/completions" {
			t.Errorf("path = %s, want /chat/completions", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Errorf("authorization = %q, want Bearer test-key", got)
		}
		if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
			t.Errorf("decode request body: %v", err)
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"hel\"}}]}\n\n"))
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}],\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":2}}\n\n"))
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
	defer server.Close()

	provider := New(Config{
		BaseURL: server.URL,
		Model:   "test-model",
		APIKey:  "test-key",
		Client:  server.Client(),
	})

	events, err := provider.RunTurn(context.Background(), agent.TurnRequest{
		Messages: []agent.Message{
			{Role: agent.RoleSystem, Content: "be concise"},
			{Role: agent.RoleUser, Content: "say hello"},
		},
	})
	if err != nil {
		t.Fatalf("RunTurn returned error: %v", err)
	}

	var text string
	var kinds []agent.EventKind
	var usage *agent.Usage
	for event := range events {
		kinds = append(kinds, event.Kind)
		if event.Kind == agent.EventKindTextDelta {
			text += event.Text
		}
		if event.Kind == agent.EventKindUsage {
			usage = event.Usage
		}
	}

	if requestBody.Model != "test-model" {
		t.Fatalf("model = %q, want test-model", requestBody.Model)
	}
	if !requestBody.Stream {
		t.Fatal("stream = false, want true")
	}
	if len(requestBody.Messages) != 2 {
		t.Fatalf("messages length = %d, want 2", len(requestBody.Messages))
	}
	if requestBody.Messages[0].Role != "system" || requestBody.Messages[0].Content != "be concise" {
		t.Fatalf("first message = %+v, want system be concise", requestBody.Messages[0])
	}
	if requestBody.Messages[1].Role != "user" || requestBody.Messages[1].Content != "say hello" {
		t.Fatalf("second message = %+v, want user say hello", requestBody.Messages[1])
	}
	if text != "hello" {
		t.Fatalf("text = %q, want hello", text)
	}
	if usage == nil {
		t.Fatal("usage event missing")
	}
	if usage.InputTokens != 3 || usage.OutputTokens != 2 {
		t.Fatalf("usage = %+v, want input 3 output 2", *usage)
	}
	wantKinds := []agent.EventKind{
		agent.EventKindTextDelta,
		agent.EventKindTextDelta,
		agent.EventKindUsage,
		agent.EventKindDone,
	}
	if !sameKinds(kinds, wantKinds) {
		t.Fatalf("event kinds = %v, want %v", kinds, wantKinds)
	}
}

func TestProviderRunTurnHTTPErrorEmitsErrorEvent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "upstream failure", http.StatusInternalServerError)
	}))
	defer server.Close()

	provider := New(Config{
		BaseURL: server.URL,
		Model:   "test-model",
		APIKey:  "test-key",
		Client:  server.Client(),
	})

	events, err := provider.RunTurn(context.Background(), agent.TurnRequest{})
	if err != nil {
		t.Fatalf("RunTurn returned error: %v", err)
	}

	var got []agent.Event
	for event := range events {
		got = append(got, event)
	}

	if len(got) != 1 {
		t.Fatalf("event count = %d, want 1", len(got))
	}
	if got[0].Kind != agent.EventKindError {
		t.Fatalf("event kind = %q, want %q", got[0].Kind, agent.EventKindError)
	}
	if got[0].Err == "" {
		t.Fatal("error message is empty")
	}
}

func sameKinds(got, want []agent.EventKind) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}
