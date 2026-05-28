package agent_test

import (
	"context"
	"fmt"
	"strings"

	"github.com/lutherfourie/vibe/go/agent"
)

func Example_fakeProvider() {
	provider := agent.FakeProvider{}
	events, err := provider.RunTurn(context.Background(), agent.TurnRequest{
		Messages: []agent.Message{
			{Role: agent.RoleUser, Content: "hello from vibe"},
		},
	})
	if err != nil {
		panic(err)
	}

	var assistantText strings.Builder
	for event := range events {
		if event.Kind == agent.EventKindTextDelta {
			assistantText.WriteString(event.Text)
		}
	}

	fmt.Println(assistantText.String())

	// Output:
	// hello from vibe
}
