package claude

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"strconv"
	"strings"

	"github.com/lutherfourie/vibe/go/agent"
)

const maxStreamJSONLineBytes = 10 * 1024 * 1024

// ParseStream consumes Claude stream-json lines and returns agnostic events.
func ParseStream(r io.Reader) ([]agent.Event, string, error) {
	var events []agent.Event
	sessionID, err := parseStream(r, func(event agent.Event) bool {
		events = append(events, event)
		return true
	})
	return events, sessionID, err
}

func parseStream(r io.Reader, emit func(agent.Event) bool) (string, error) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), maxStreamJSONLineBytes)

	var sessionID string
	for scanner.Scan() {
		lineSessionID, events := parseLine(scanner.Bytes())
		if lineSessionID != "" {
			sessionID = lineSessionID
		}
		for _, event := range events {
			if !emit(event) {
				return sessionID, nil
			}
		}
	}
	return sessionID, scanner.Err()
}

func parseLine(line []byte) (string, []agent.Event) {
	line = bytes.TrimSpace(line)
	if len(line) == 0 {
		return "", nil
	}

	var value any
	if err := json.Unmarshal(line, &value); err != nil {
		return "", nil
	}

	root, ok := value.(map[string]any)
	if !ok {
		return "", nil
	}

	lineType := stringField(root, "type")
	subtype := stringField(root, "subtype")

	var sessionID string
	if isInitLine(lineType, subtype) || lineType == "result" {
		sessionID = sessionIDField(root)
	}

	var events []agent.Event
	if lineType == "stream_event" {
		for _, text := range collectTextDeltas(value) {
			events = append(events, agent.TextDelta(text))
		}
	}
	for _, call := range collectToolCalls(value) {
		events = append(events, agent.ToolCallEvent(call))
	}
	for _, result := range collectToolResults(value) {
		events = append(events, agent.ToolResultEvent(result))
	}
	if lineType == "result" {
		events = append(events, agent.UsageEvent(usageFromResult(root)), agent.Done())
	}

	return sessionID, events
}

func isInitLine(lineType, subtype string) bool {
	return lineType == "init" || subtype == "init" || (lineType == "system" && subtype == "")
}

func collectTextDeltas(value any) []string {
	var texts []string
	walkObjects(value, func(obj map[string]any) {
		if stringField(obj, "type") != "text_delta" {
			return
		}
		if text := stringField(obj, "text"); text != "" {
			texts = append(texts, text)
		}
	})
	return texts
}

func collectToolCalls(value any) []agent.ToolCall {
	var calls []agent.ToolCall
	walkObjects(value, func(obj map[string]any) {
		call, ok := toolCallFromObject(obj)
		if ok {
			calls = append(calls, call)
		}
	})
	return calls
}

func collectToolResults(value any) []agent.ToolResult {
	var results []agent.ToolResult
	walkObjects(value, func(obj map[string]any) {
		result, ok := toolResultFromObject(obj)
		if ok {
			results = append(results, result)
		}
	})
	return results
}

func walkObjects(value any, visit func(map[string]any)) {
	switch typed := value.(type) {
	case map[string]any:
		visit(typed)
		for _, child := range typed {
			walkObjects(child, visit)
		}
	case []any:
		for _, child := range typed {
			walkObjects(child, visit)
		}
	}
}

func toolCallFromObject(obj map[string]any) (agent.ToolCall, bool) {
	if stringField(obj, "type") != "tool_use" {
		return agent.ToolCall{}, false
	}

	id := stringField(obj, "id")
	name := stringField(obj, "name")
	if id == "" && name == "" {
		return agent.ToolCall{}, false
	}

	args := rawField(obj, "input")
	if args == nil {
		args = rawField(obj, "args")
	}
	if args == nil {
		args = rawField(obj, "arguments")
	}

	return agent.ToolCall{ID: id, Name: name, Args: args}, true
}

func toolResultFromObject(obj map[string]any) (agent.ToolResult, bool) {
	if stringField(obj, "type") != "tool_result" {
		return agent.ToolResult{}, false
	}

	id := stringField(obj, "tool_use_id")
	if id == "" {
		id = stringField(obj, "id")
	}
	content := contentString(obj["content"])
	if id == "" && content == "" {
		return agent.ToolResult{}, false
	}

	return agent.ToolResult{ID: id, Content: content, IsError: boolField(obj, "is_error")}, true
}

func usageFromResult(root map[string]any) agent.Usage {
	usage := agent.Usage{
		CostUSD: numberField(root, "total_cost_usd"),
	}

	if usageMap, ok := root["usage"].(map[string]any); ok {
		usage.InputTokens = int(numberField(usageMap, "input_tokens"))
		usage.OutputTokens = int(numberField(usageMap, "output_tokens"))
		return usage
	}

	usage.InputTokens = int(numberField(root, "input_tokens"))
	usage.OutputTokens = int(numberField(root, "output_tokens"))
	return usage
}

func sessionIDField(obj map[string]any) string {
	if sessionID := stringField(obj, "session_id"); sessionID != "" {
		return sessionID
	}
	return stringField(obj, "sessionId")
}

func stringField(obj map[string]any, key string) string {
	value, ok := obj[key]
	if !ok {
		return ""
	}
	text, _ := value.(string)
	return text
}

func boolField(obj map[string]any, key string) bool {
	value, ok := obj[key]
	if !ok {
		return false
	}
	result, _ := value.(bool)
	return result
}

func numberField(obj map[string]any, key string) float64 {
	value, ok := obj[key]
	if !ok {
		return 0
	}
	switch typed := value.(type) {
	case float64:
		return typed
	case int:
		return float64(typed)
	case json.Number:
		number, _ := typed.Float64()
		return number
	case string:
		number, _ := strconv.ParseFloat(typed, 64)
		return number
	default:
		return 0
	}
}

func rawField(obj map[string]any, key string) json.RawMessage {
	value, ok := obj[key]
	if !ok || value == nil {
		return nil
	}
	raw, err := json.Marshal(value)
	if err != nil || bytes.Equal(raw, []byte("null")) {
		return nil
	}
	return raw
}

func contentString(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	case []any:
		var b strings.Builder
		for _, item := range typed {
			b.WriteString(contentString(item))
		}
		return b.String()
	case map[string]any:
		if text := stringField(typed, "text"); text != "" {
			return text
		}
		if content, ok := typed["content"]; ok {
			return contentString(content)
		}
		if value, ok := typed["value"]; ok {
			return contentString(value)
		}
	}

	raw, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(raw)
}
