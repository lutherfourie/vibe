package openai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
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

func TestProviderRunTurnStreamsToolCallFragments(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_123\",\"function\":{\"name\":\"look\",\"arguments\":\"{\\\"query\\\":\\\"vi\"}}]}}]}\n\n"))
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"name\":\"up\",\"arguments\":\"be\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}],\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":7}}\n\n"))
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
			{Role: agent.RoleUser, Content: "look up vibe"},
		},
	})
	if err != nil {
		t.Fatalf("RunTurn returned error: %v", err)
	}

	var got []agent.Event
	for event := range events {
		got = append(got, event)
	}

	wantKinds := []agent.EventKind{
		agent.EventKindToolCall,
		agent.EventKindUsage,
		agent.EventKindDone,
	}
	var gotKinds []agent.EventKind
	for _, event := range got {
		gotKinds = append(gotKinds, event.Kind)
	}
	if !sameKinds(gotKinds, wantKinds) {
		t.Fatalf("event kinds = %v, want %v", gotKinds, wantKinds)
	}
	if got[0].ToolCall == nil {
		t.Fatal("tool call event has nil payload")
	}
	if got[0].ToolCall.ID != "call_123" {
		t.Fatalf("tool call id = %q, want call_123", got[0].ToolCall.ID)
	}
	if got[0].ToolCall.Name != "lookup" {
		t.Fatalf("tool call name = %q, want lookup", got[0].ToolCall.Name)
	}
	if !jsonEqual(got[0].ToolCall.Args, []byte(`{"query":"vibe"}`)) {
		t.Fatalf("tool call args = %s, want {\"query\":\"vibe\"}", got[0].ToolCall.Args)
	}
	if got[1].Usage == nil {
		t.Fatal("usage event missing")
	}
	if got[1].Usage.InputTokens != 5 || got[1].Usage.OutputTokens != 7 {
		t.Fatalf("usage = %+v, want input 5 output 7", *got[1].Usage)
	}
}

func TestProviderRunTurnIncludesToolsInRequest(t *testing.T) {
	var requestBody struct {
		Tools []struct {
			Type     string `json:"type"`
			Function struct {
				Name        string          `json:"name"`
				Description string          `json:"description"`
				Parameters  json.RawMessage `json:"parameters"`
			} `json:"function"`
		} `json:"tools"`
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
			t.Errorf("decode request body: %v", err)
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
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
			{Role: agent.RoleUser, Content: "search"},
		},
		Tools: []agent.ToolSpec{
			{
				Name:        "search",
				Description: "Search project docs.",
				Schema:      json.RawMessage(`{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}`),
			},
			{
				Name:        "ping",
				Description: "Ping a service.",
			},
		},
	})
	if err != nil {
		t.Fatalf("RunTurn returned error: %v", err)
	}
	for range events {
	}

	if len(requestBody.Tools) != 2 {
		t.Fatalf("tools length = %d, want 2", len(requestBody.Tools))
	}
	if requestBody.Tools[0].Type != "function" {
		t.Fatalf("first tool type = %q, want function", requestBody.Tools[0].Type)
	}
	if requestBody.Tools[0].Function.Name != "search" {
		t.Fatalf("first tool name = %q, want search", requestBody.Tools[0].Function.Name)
	}
	if requestBody.Tools[0].Function.Description != "Search project docs." {
		t.Fatalf("first tool description = %q, want Search project docs.", requestBody.Tools[0].Function.Description)
	}
	if !jsonEqual(requestBody.Tools[0].Function.Parameters, []byte(`{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}`)) {
		t.Fatalf("first tool parameters = %s, want provided schema", requestBody.Tools[0].Function.Parameters)
	}
	if requestBody.Tools[1].Type != "function" {
		t.Fatalf("second tool type = %q, want function", requestBody.Tools[1].Type)
	}
	if requestBody.Tools[1].Function.Name != "ping" {
		t.Fatalf("second tool name = %q, want ping", requestBody.Tools[1].Function.Name)
	}
	if requestBody.Tools[1].Function.Description != "Ping a service." {
		t.Fatalf("second tool description = %q, want Ping a service.", requestBody.Tools[1].Function.Description)
	}
	if !jsonEqual(requestBody.Tools[1].Function.Parameters, []byte(`{"type":"object"}`)) {
		t.Fatalf("second tool parameters = %s, want default object schema", requestBody.Tools[1].Function.Parameters)
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

func jsonEqual(got, want []byte) bool {
	var gotValue any
	var wantValue any
	if err := json.Unmarshal(got, &gotValue); err != nil {
		return false
	}
	if err := json.Unmarshal(want, &wantValue); err != nil {
		return false
	}
	return reflect.DeepEqual(gotValue, wantValue)
}
