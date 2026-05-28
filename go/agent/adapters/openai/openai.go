package openai

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/lutherfourie/vibe/go/agent"
)

// Config contains the settings for an OpenAI-compatible chat completions API.
type Config struct {
	BaseURL string
	Model   string
	APIKey  string
	Client  *http.Client
}

// Provider implements agent.Provider against OpenAI-compatible chat completions.
type Provider struct {
	cfg    Config
	client *http.Client
}

var _ agent.Provider = (*Provider)(nil)

// New returns an OpenAI-compatible provider. A nil client uses http.DefaultClient.
func New(cfg Config) *Provider {
	client := cfg.Client
	if client == nil {
		client = http.DefaultClient
	}
	return &Provider{cfg: cfg, client: client}
}

// Name returns the provider name.
func (p *Provider) Name() string {
	return "openai"
}

// RunTurn posts one chat completion request and streams provider-neutral events.
func (p *Provider) RunTurn(ctx context.Context, turn agent.TurnRequest) (<-chan agent.Event, error) {
	out := make(chan agent.Event, 1)
	go p.runTurn(ctx, turn, out)
	return out, nil
}

func (p *Provider) runTurn(ctx context.Context, turn agent.TurnRequest, out chan<- agent.Event) {
	defer close(out)

	var body strings.Builder
	if err := json.NewEncoder(&body).Encode(chatCompletionRequest{
		Model:    p.cfg.Model,
		Messages: mapMessages(turn.Messages),
		Stream:   true,
	}); err != nil {
		sendEvent(ctx, out, agent.ErrorEvent(err.Error()))
		return
	}

	httpReq, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		strings.TrimRight(p.cfg.BaseURL, "/")+"/chat/completions",
		strings.NewReader(body.String()),
	)
	if err != nil {
		sendEvent(ctx, out, agent.ErrorEvent(err.Error()))
		return
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.cfg.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(httpReq)
	if err != nil {
		sendRequestError(ctx, out, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		sendEvent(ctx, out, agent.ErrorEvent("openai chat completions returned "+resp.Status))
		return
	}

	p.streamResponse(ctx, resp, out)
}

func (p *Provider) streamResponse(ctx context.Context, resp *http.Response, out chan<- agent.Event) {
	scanner := bufio.NewScanner(resp.Body)
	var usage *agent.Usage

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}

		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" {
			continue
		}
		if data == "[DONE]" {
			sendUsageAndDone(ctx, out, usage)
			return
		}

		var chunk chatCompletionChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			sendEvent(ctx, out, agent.ErrorEvent(err.Error()))
			return
		}
		if chunk.Usage != nil {
			usage = &agent.Usage{
				InputTokens:  chunk.Usage.PromptTokens,
				OutputTokens: chunk.Usage.CompletionTokens,
			}
		}
		if len(chunk.Choices) == 0 {
			continue
		}
		content := chunk.Choices[0].Delta.Content
		if content == "" {
			continue
		}
		if !sendEvent(ctx, out, agent.TextDelta(content)) {
			return
		}
	}

	if err := scanner.Err(); err != nil {
		sendRequestError(ctx, out, err)
		return
	}
	sendUsageAndDone(ctx, out, usage)
}

func sendUsageAndDone(ctx context.Context, out chan<- agent.Event, usage *agent.Usage) {
	if usage != nil {
		if !sendEvent(ctx, out, agent.UsageEvent(*usage)) {
			return
		}
	}
	sendEvent(ctx, out, agent.Done())
}

func mapMessages(messages []agent.Message) []chatMessage {
	mapped := make([]chatMessage, 0, len(messages))
	for _, message := range messages {
		mapped = append(mapped, chatMessage{
			Role:    mapRole(message.Role),
			Content: message.Content,
		})
	}
	return mapped
}

func mapRole(role agent.Role) string {
	switch role {
	case agent.RoleSystem:
		return "system"
	case agent.RoleUser:
		return "user"
	case agent.RoleAssistant:
		return "assistant"
	case agent.RoleTool:
		return "tool"
	default:
		return string(role)
	}
}

func sendEvent(ctx context.Context, out chan<- agent.Event, event agent.Event) bool {
	select {
	case <-ctx.Done():
		return false
	case out <- event:
		return true
	}
}

func sendRequestError(ctx context.Context, out chan<- agent.Event, err error) {
	if err == nil {
		return
	}
	if ctx.Err() != nil {
		select {
		case out <- agent.ErrorEvent(ctx.Err().Error()):
		default:
		}
		return
	}
	sendEvent(ctx, out, agent.ErrorEvent(err.Error()))
}

type chatCompletionRequest struct {
	Model    string        `json:"model"`
	Messages []chatMessage `json:"messages"`
	Stream   bool          `json:"stream"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatCompletionChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
	Usage *struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
}
