package agent

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/lutherfourie/vibe/go/internal/remote"
)

func TestProcessCommandEmitsTelemetryBeforePauseWaitsForResume(t *testing.T) {
	telemetry := make(chan map[string]any, 2)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPatch && r.URL.Path == "/rest/v1/agent_commands":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{}]`))
		case r.Method == http.MethodPost && r.URL.Path == "/rest/v1/agent_responses":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{}]`))
		case r.Method == http.MethodPost && r.URL.Path == "/rest/v1/agent_events":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{}]`))
		case r.Method == http.MethodGet && r.URL.Path == "/rest/v1/agent_commands":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[]`))
		case r.Method == http.MethodPost && r.URL.Path == "/rest/v1/telemetry_events":
			var event map[string]any
			if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
				t.Errorf("decode telemetry body: %v", err)
			}
			telemetry <- event
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{}]`))
		default:
			t.Errorf("unexpected request %s %s", r.Method, r.URL.String())
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()
	t.Setenv("SUPABASE_URL", server.URL)
	t.Setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	ctrl := NewRemoteControl(remote.NewClient(), "session-1")
	go func() {
		done <- ctrl.ProcessCommand(ctx, remote.AgentCommand{
			ID:        "cmd-1",
			SessionID: "session-1",
			Command:   "pause",
			IssuedBy:  "dashboard",
		})
	}()

	select {
	case event := <-telemetry:
		if got, want := event["kind"], "remote_command_processed"; got != want {
			t.Fatalf("telemetry kind = %v, want %s", got, want)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timed out waiting for pause command telemetry")
	}

	cancel()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("pause command did not stop after context cancellation")
	}
}
