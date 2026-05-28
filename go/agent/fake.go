package agent

import (
	"context"
	"time"
)

const cancellationTerminalWait = 10 * time.Millisecond

// FakeProvider is a deterministic in-memory Provider for tests and local use.
type FakeProvider struct {
	Events []Event
}

// Name returns the provider name.
func (p FakeProvider) Name() string {
	return "fake"
}

// RunTurn streams scripted events or, by default, echoes the last user message.
func (p FakeProvider) RunTurn(ctx context.Context, req TurnRequest) (<-chan Event, error) {
	events := p.Events
	if len(events) == 0 {
		events = defaultFakeEvents(req)
	}

	out := make(chan Event)
	go func() {
		defer close(out)
		for _, event := range events {
			if err := ctx.Err(); err != nil {
				sendCancellationError(out, err)
				return
			}
			select {
			case <-ctx.Done():
				sendCancellationError(out, ctx.Err())
				return
			case out <- event:
			}
			if isTerminal(event) {
				return
			}
		}

		if err := ctx.Err(); err != nil {
			sendCancellationError(out, err)
			return
		}
		select {
		case <-ctx.Done():
			sendCancellationError(out, ctx.Err())
		case out <- Done():
		}
	}()

	return out, nil
}

func defaultFakeEvents(req TurnRequest) []Event {
	text := lastUserMessage(req.Messages)
	events := make([]Event, 0, len(textChunks(text))+2)
	for _, chunk := range textChunks(text) {
		events = append(events, TextDelta(chunk))
	}
	events = append(events, UsageEvent(Usage{}), Done())
	return events
}

func lastUserMessage(messages []Message) string {
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role == RoleUser {
			return messages[i].Content
		}
	}
	return ""
}

func textChunks(text string) []string {
	runes := []rune(text)
	if len(runes) == 0 {
		return nil
	}

	const chunkSize = 8
	chunks := make([]string, 0, (len(runes)+chunkSize-1)/chunkSize)
	for start := 0; start < len(runes); start += chunkSize {
		end := start + chunkSize
		if end > len(runes) {
			end = len(runes)
		}
		chunks = append(chunks, string(runes[start:end]))
	}
	return chunks
}

func isTerminal(event Event) bool {
	return event.Kind == EventKindDone || event.Kind == EventKindError
}

func sendCancellationError(out chan<- Event, err error) {
	if err == nil {
		return
	}
	select {
	case out <- ErrorEvent(err.Error()):
	case <-time.After(cancellationTerminalWait):
	}
}
