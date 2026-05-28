package openai

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"sort"
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
		Tools:    mapTools(turn.Tools),
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
	var toolCalls toolCallAccumulator

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
			sendToolCallsUsageAndDone(ctx, out, toolCalls.toolCalls(), usage)
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
		choice := chunk.Choices[0]
		toolCalls.add(choice.Delta.ToolCalls)

		content := choice.Delta.Content
		if content != "" {
			if !sendEvent(ctx, out, agent.TextDelta(content)) {
				return
			}
		}
		if choice.FinishReason == "tool_calls" {
			sendToolCallsUsageAndDone(ctx, out, toolCalls.toolCalls(), usage)
			return
		}
	}

	if err := scanner.Err(); err != nil {
		sendRequestError(ctx, out, err)
		return
	}
	sendToolCallsUsageAndDone(ctx, out, toolCalls.toolCalls(), usage)
}

func sendToolCallsUsageAndDone(ctx context.Context, out chan<- agent.Event, calls []agent.ToolCall, usage *agent.Usage) {
	for _, call := range calls {
		if !sendEvent(ctx, out, agent.ToolCallEvent(call)) {
			return
		}
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

func mapTools(tools []agent.ToolSpec) []chatTool {
	if len(tools) == 0 {
		return nil
	}

	mapped := make([]chatTool, 0, len(tools))
	for _, tool := range tools {
		parameters := tool.Schema
		if len(parameters) == 0 {
			parameters = json.RawMessage(`{"type":"object"}`)
		}
		mapped = append(mapped, chatTool{
			Type: "function",
			Function: chatToolFunction{
				Name:        tool.Name,
				Description: tool.Description,
				Parameters:  parameters,
			},
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
	Tools    []chatTool    `json:"tools,omitempty"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatTool struct {
	Type     string           `json:"type"`
	Function chatToolFunction `json:"function"`
}

type chatToolFunction struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Parameters  json.RawMessage `json:"parameters"`
}

type chatCompletionChunk struct {
	Choices []struct {
		Delta struct {
			Content   string              `json:"content"`
			ToolCalls []chatToolCallDelta `json:"tool_calls"`
		} `json:"delta"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage *struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
}

type chatToolCallDelta struct {
	Index    int    `json:"index"`
	ID       string `json:"id"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type toolCallAccumulator struct {
	calls map[int]*streamedToolCall
}

func (a *toolCallAccumulator) add(deltas []chatToolCallDelta) {
	for _, delta := range deltas {
		if a.calls == nil {
			a.calls = make(map[int]*streamedToolCall)
		}
		call := a.calls[delta.Index]
		if call == nil {
			call = &streamedToolCall{}
			a.calls[delta.Index] = call
		}
		call.id += delta.ID
		call.name += delta.Function.Name
		call.arguments += delta.Function.Arguments
	}
}

func (a toolCallAccumulator) toolCalls() []agent.ToolCall {
	if len(a.calls) == 0 {
		return nil
	}

	indexes := make([]int, 0, len(a.calls))
	for index := range a.calls {
		indexes = append(indexes, index)
	}
	sort.Ints(indexes)

	calls := make([]agent.ToolCall, 0, len(indexes))
	for _, index := range indexes {
		call := a.calls[index]
		var args json.RawMessage
		if call.arguments != "" {
			args = json.RawMessage(call.arguments)
		}
		calls = append(calls, agent.ToolCall{
			ID:   call.id,
			Name: call.name,
			Args: args,
		})
	}
	return calls
}

type streamedToolCall struct {
	id        string
	name      string
	arguments string
}
