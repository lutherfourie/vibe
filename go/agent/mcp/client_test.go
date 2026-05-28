package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net"
	"reflect"
	"testing"
	"time"

	"github.com/lutherfourie/vibe/go/agent"
)

func TestClientHandshakeListToolsAndCallTool(t *testing.T) {
	clientConn, serverConn := net.Pipe()
	defer serverConn.Close()

	requests := make(chan rpcMessage, 4)
	serverDone := make(chan error, 1)
	go serveFakeMCP(serverConn, requests, serverDone)

	client := newClientWithTransport(ServerSpec{}, clientConn, clientConn, nil)
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	if err := client.Start(ctx); err != nil {
		t.Fatalf("Start returned error: %v", err)
	}

	initialize := assertRequest(t, requests, "initialize")
	var initializeParams struct {
		ProtocolVersion string `json:"protocolVersion"`
		ClientInfo      struct {
			Name    string `json:"name"`
			Version string `json:"version"`
		} `json:"clientInfo"`
	}
	if err := json.Unmarshal(initialize.Params, &initializeParams); err != nil {
		t.Fatalf("initialize params unmarshal failed: %v", err)
	}
	if initializeParams.ProtocolVersion == "" {
		t.Fatal("initialize protocolVersion is empty")
	}
	if got, want := initializeParams.ClientInfo.Name, "vibe"; got != want {
		t.Fatalf("initialize clientInfo.name = %q, want %q", got, want)
	}
	if initializeParams.ClientInfo.Version == "" {
		t.Fatal("initialize clientInfo.version is empty")
	}
	assertNotification(t, requests, "notifications/initialized")

	tools, err := client.ListTools(ctx)
	if err != nil {
		t.Fatalf("ListTools returned error: %v", err)
	}
	assertRequest(t, requests, "tools/list")

	wantSchema := json.RawMessage(`{"type":"object","properties":{"path":{"type":"string"}}}`)
	wantTools := []Tool{
		{Name: "read_file", Description: "Read a file", InputSchema: wantSchema},
	}
	if !reflect.DeepEqual(tools, wantTools) {
		t.Fatalf("tools = %#v, want %#v", tools, wantTools)
	}

	spec := tools[0].ToAgentToolSpec()
	if got, want := spec, (agent.ToolSpec{Name: "read_file", Description: "Read a file", Schema: wantSchema}); !reflect.DeepEqual(got, want) {
		t.Fatalf("ToAgentToolSpec() = %#v, want %#v", got, want)
	}

	result, err := client.CallTool(ctx, "read_file", json.RawMessage(`{"path":"README.md"}`))
	if err != nil {
		t.Fatalf("CallTool returned error: %v", err)
	}
	call := assertRequest(t, requests, "tools/call")
	var params struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := json.Unmarshal(call.Params, &params); err != nil {
		t.Fatalf("tools/call params unmarshal failed: %v", err)
	}
	if got, want := params.Name, "read_file"; got != want {
		t.Fatalf("tools/call name = %q, want %q", got, want)
	}
	if got, want := string(params.Arguments), `{"path":"README.md"}`; got != want {
		t.Fatalf("tools/call arguments = %s, want %s", got, want)
	}

	if got, want := result, (ToolResult{Content: "file contents", IsError: false}); got != want {
		t.Fatalf("CallTool result = %#v, want %#v", got, want)
	}

	if err := client.Close(); err != nil {
		t.Fatalf("Close returned error: %v", err)
	}
	select {
	case err := <-serverDone:
		if err != nil {
			t.Fatalf("fake MCP server returned error: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for fake MCP server to stop")
	}
}

func serveFakeMCP(conn io.ReadWriteCloser, requests chan<- rpcMessage, done chan<- error) {
	defer close(requests)
	defer close(done)

	scanner := bufio.NewScanner(conn)
	writer := bufio.NewWriter(conn)
	for scanner.Scan() {
		var msg rpcMessage
		if err := json.Unmarshal(scanner.Bytes(), &msg); err != nil {
			done <- err
			return
		}
		requests <- msg

		if msg.ID == nil {
			continue
		}

		var result any
		switch msg.Method {
		case "initialize":
			result = map[string]any{
				"protocolVersion": "2025-11-25",
				"serverInfo": map[string]any{
					"name":    "fake-mcp",
					"version": "0.0.1",
				},
			}
		case "tools/list":
			result = map[string]any{
				"tools": []any{
					map[string]any{
						"name":        "read_file",
						"description": "Read a file",
						"inputSchema": json.RawMessage(`{"type":"object","properties":{"path":{"type":"string"}}}`),
					},
				},
			}
		case "tools/call":
			result = map[string]any{
				"content": []any{
					map[string]any{"type": "text", "text": "file contents"},
				},
				"isError": false,
			}
		default:
			done <- writeRPCError(writer, msg.ID, -32601, "method not found")
			return
		}

		if err := writeRPCResult(writer, msg.ID, result); err != nil {
			done <- err
			return
		}
	}
	done <- scanner.Err()
}

func assertRequest(t *testing.T, requests <-chan rpcMessage, method string) rpcMessage {
	t.Helper()

	msg := nextMessage(t, requests)
	if msg.ID == nil {
		t.Fatalf("%s message has nil id", method)
	}
	if got := msg.Method; got != method {
		t.Fatalf("method = %q, want %q", got, method)
	}
	if got := msg.JSONRPC; got != "2.0" {
		t.Fatalf("jsonrpc = %q, want 2.0", got)
	}
	return msg
}

func assertNotification(t *testing.T, requests <-chan rpcMessage, method string) rpcMessage {
	t.Helper()

	msg := nextMessage(t, requests)
	if msg.ID != nil {
		t.Fatalf("%s notification has id %s, want nil", method, *msg.ID)
	}
	if got := msg.Method; got != method {
		t.Fatalf("notification method = %q, want %q", got, method)
	}
	return msg
}

func nextMessage(t *testing.T, requests <-chan rpcMessage) rpcMessage {
	t.Helper()

	select {
	case msg, ok := <-requests:
		if !ok {
			t.Fatal("fake MCP server request channel closed")
		}
		return msg
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for MCP request")
	}
	return rpcMessage{}
}
