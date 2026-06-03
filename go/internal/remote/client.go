package remote

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"time"
)

// Client provides a minimal REST client for Supabase (PostgREST) to support
// remote command & control for autonomous Vibe agents.
// Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from env (service key for runner).
// No external deps beyond stdlib; suitable for Go autonomous runners.
type Client struct {
	baseURL string
	key     string
	http    *http.Client
}

// NewClient creates a client. Falls back to local defaults if env not set.
func NewClient() *Client {
	base := os.Getenv("SUPABASE_URL")
	if base == "" {
		base = "http://127.0.0.1:54421"
	}
	key := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
	if key == "" {
		// For local dev only; in prod always set service key.
		key = os.Getenv("SUPABASE_ANON_KEY")
	}
	return &Client{
		baseURL: base,
		key:     key,
		http:    &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *Client) headers() http.Header {
	h := http.Header{}
	h.Set("apikey", c.key)
	h.Set("Authorization", "Bearer "+c.key)
	h.Set("Content-Type", "application/json")
	h.Set("Prefer", "return=representation")
	return h
}

func (c *Client) do(ctx context.Context, method, path string, body any, out any) error {
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	}
	u := c.baseURL + "/rest/v1" + path
	req, err := http.NewRequestWithContext(ctx, method, u, r)
	if err != nil {
		return err
	}
	req.Header = c.headers()
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("supabase %s %s: %s %s", method, path, resp.Status, string(b))
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

// AgentCommand represents a row in agent_commands.
type AgentCommand struct {
	ID          string          `json:"id"`
	SessionID   string          `json:"session_id"`
	Command     string          `json:"command"`
	Payload     json.RawMessage `json:"payload"`
	IssuedBy    string          `json:"issued_by"`
	Status      string          `json:"status"`
	CreatedAt   time.Time       `json:"created_at"`
	ProcessedAt *time.Time      `json:"processed_at,omitempty"`
}

// AgentResponse for insert.
type AgentResponse struct {
	CommandID string          `json:"command_id"`
	SessionID string          `json:"session_id,omitempty"`
	Status    string          `json:"status"`
	Result    json.RawMessage `json:"result"`
	Message   string          `json:"message,omitempty"`
}

// AgentEvent for insert.
type AgentEvent struct {
	SessionID string          `json:"session_id"`
	CommandID string          `json:"command_id,omitempty"`
	Kind      string          `json:"kind"`
	Payload   json.RawMessage `json:"payload"`
}

// ListPendingCommands returns pending commands for a session (or all if sessionID=="").
func (c *Client) ListPendingCommands(ctx context.Context, sessionID string) ([]AgentCommand, error) {
	q := url.Values{}
	q.Set("status", "eq.pending")
	q.Set("order", "created_at.asc")
	if sessionID != "" {
		q.Set("session_id", "eq."+sessionID)
	}
	path := "/agent_commands?" + q.Encode()
	var cmds []AgentCommand
	if err := c.do(ctx, "GET", path, nil, &cmds); err != nil {
		return nil, err
	}
	return cmds, nil
}

// UpdateCommandStatus marks a command processed.
func (c *Client) UpdateCommandStatus(ctx context.Context, id, status string) error {
	path := "/agent_commands?id=eq." + id
	body := map[string]any{
		"status":       status,
		"processed_at": time.Now().UTC().Format(time.RFC3339),
	}
	return c.do(ctx, "PATCH", path, body, nil)
}

// CreateResponse writes a response for a command.
func (c *Client) CreateResponse(ctx context.Context, r AgentResponse) error {
	path := "/agent_responses"
	return c.do(ctx, "POST", path, r, nil)
}

// CreateEvent appends an event (for monitoring / dashboard).
func (c *Client) CreateEvent(ctx context.Context, e AgentEvent) error {
	path := "/agent_events"
	return c.do(ctx, "POST", path, e, nil)
}

// PollForCommands is a simple blocking poller useful inside an autonomous runner loop.
// Calls handler for each pending command; handler should call Update + CreateResponse.
func (c *Client) PollForCommands(ctx context.Context, sessionID string, interval time.Duration, handler func(AgentCommand) error) error {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-t.C:
			cmds, err := c.ListPendingCommands(ctx, sessionID)
			if err != nil {
				// log in real impl; continue polling
				continue
			}
			for _, cmd := range cmds {
				if err := handler(cmd); err != nil {
					// best effort, continue
					_ = c.CreateEvent(ctx, AgentEvent{
						SessionID: cmd.SessionID,
						CommandID: cmd.ID,
						Kind:      "command_error",
						Payload:   json.RawMessage(`{"error": "` + err.Error() + `"}`),
					})
				}
			}
		}
	}
}