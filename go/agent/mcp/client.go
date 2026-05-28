package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"

	"github.com/lutherfourie/vibe/go/agent"
)

const (
	protocolVersion     = "2025-11-25"
	clientName          = "vibe"
	clientVersion       = "0.1.0"
	maxRPCLineBytes     = 10 * 1024 * 1024
	errClientClosedText = "mcp client closed"
)

// ServerSpec describes an MCP server process launched by the client.
type ServerSpec struct {
	Command string
	Args    []string
	Env     []string
}

// Tool describes an MCP tool advertised by tools/list.
type Tool struct {
	Name        string
	Description string
	InputSchema json.RawMessage
}

// ToAgentToolSpec converts an MCP tool description into the agent core type.
func (t Tool) ToAgentToolSpec() agent.ToolSpec {
	return agent.ToolSpec{
		Name:        t.Name,
		Description: t.Description,
		Schema:      append(json.RawMessage(nil), t.InputSchema...),
	}
}

// ToolResult is the minimal result shape returned by tools/call.
type ToolResult struct {
	Content string
	IsError bool
}

// Client talks to an MCP server using JSON-RPC 2.0 over newline-delimited stdio.
type Client struct {
	spec ServerSpec

	reader io.Reader
	writer io.Writer
	closer io.Closer
	wait   func() error

	mu            sync.Mutex
	writeMu       sync.Mutex
	nextID        int64
	pending       map[string]chan rpcResponse
	rpcWriter     *bufio.Writer
	readDone      chan error
	notifications chan rpcMessage
	started       bool
	closed        bool
}

type rpcResponse struct {
	msg rpcMessage
	err error
}

// NewClient returns a client that will launch spec as a subprocess on Start.
func NewClient(spec ServerSpec) *Client {
	return newClientWithTransport(spec, nil, nil, nil)
}

func newClientWithTransport(spec ServerSpec, reader io.Reader, writer io.Writer, closeFn func() error) *Client {
	return &Client{
		spec:          spec,
		reader:        reader,
		writer:        writer,
		closer:        inferCloser(reader, writer, closeFn),
		pending:       make(map[string]chan rpcResponse),
		notifications: make(chan rpcMessage, 16),
	}
}

// Start launches the server if needed, performs initialize, then sends initialized.
func (c *Client) Start(ctx context.Context) error {
	if err := c.ensureStarted(ctx); err != nil {
		return err
	}

	_, err := c.request(ctx, "initialize", initializeParams{
		ProtocolVersion: protocolVersion,
		Capabilities:    map[string]any{},
		ClientInfo: implementationInfo{
			Name:    clientName,
			Version: clientVersion,
		},
	})
	if err != nil {
		_ = c.Close()
		return err
	}
	if err := c.notify("notifications/initialized", nil); err != nil {
		_ = c.Close()
		return err
	}
	return nil
}

// ListTools requests tools/list and returns the advertised tools.
func (c *Client) ListTools(ctx context.Context) ([]Tool, error) {
	raw, err := c.request(ctx, "tools/list", nil)
	if err != nil {
		return nil, err
	}

	var decoded struct {
		Tools []struct {
			Name        string          `json:"name"`
			Description string          `json:"description"`
			InputSchema json.RawMessage `json:"inputSchema"`
		} `json:"tools"`
	}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return nil, err
	}

	tools := make([]Tool, 0, len(decoded.Tools))
	for _, tool := range decoded.Tools {
		tools = append(tools, Tool{
			Name:        tool.Name,
			Description: tool.Description,
			InputSchema: append(json.RawMessage(nil), tool.InputSchema...),
		})
	}
	return tools, nil
}

// CallTool invokes a tool by name using the provided raw JSON arguments.
func (c *Client) CallTool(ctx context.Context, name string, args json.RawMessage) (ToolResult, error) {
	var arguments json.RawMessage
	if len(args) > 0 {
		arguments = append(json.RawMessage(nil), args...)
	}

	raw, err := c.request(ctx, "tools/call", callToolParams{Name: name, Arguments: arguments})
	if err != nil {
		return ToolResult{}, err
	}

	var decoded struct {
		Content json.RawMessage `json:"content"`
		IsError bool            `json:"isError"`
	}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return ToolResult{}, err
	}
	return ToolResult{Content: contentText(decoded.Content), IsError: decoded.IsError}, nil
}

// Close closes the transport and fails outstanding requests.
func (c *Client) Close() error {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return nil
	}
	c.closed = true
	closer := c.closer
	readDone := c.readDone
	pending := c.pending
	c.pending = make(map[string]chan rpcResponse)
	c.mu.Unlock()

	closeErr := errors.New(errClientClosedText)
	for _, ch := range pending {
		ch <- rpcResponse{err: closeErr}
	}

	var err error
	if closer != nil {
		err = closer.Close()
	}
	if readDone != nil {
		<-readDone
	}
	if c.wait != nil {
		_ = c.wait()
	}
	return err
}

func (c *Client) ensureStarted(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return errors.New(errClientClosedText)
	}
	if c.started {
		c.mu.Unlock()
		return nil
	}
	reader := c.reader
	writer := c.writer
	closer := c.closer
	wait := c.wait
	spec := c.spec
	c.mu.Unlock()

	if reader == nil || writer == nil {
		transport, err := startProcessTransport(spec)
		if err != nil {
			return err
		}
		reader = transport.stdout
		writer = transport.stdin
		closer = transport
		wait = transport.Wait
	}

	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		if closer != nil {
			_ = closer.Close()
		}
		return errors.New(errClientClosedText)
	}
	c.reader = reader
	c.writer = writer
	c.closer = closer
	c.wait = wait
	c.rpcWriter = bufio.NewWriter(writer)
	c.readDone = make(chan error, 1)
	c.started = true
	readDone := c.readDone
	c.mu.Unlock()

	go c.readLoop(reader, readDone)
	return nil
}

func (c *Client) request(ctx context.Context, method string, params any) (json.RawMessage, error) {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return nil, errors.New(errClientClosedText)
	}
	c.nextID++
	id := c.nextID
	c.mu.Unlock()

	msg, err := makeRPCRequest(id, method, params)
	if err != nil {
		return nil, err
	}

	responseCh := make(chan rpcResponse, 1)
	key := idKey(msg.ID)
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return nil, errors.New(errClientClosedText)
	}
	c.pending[key] = responseCh
	c.mu.Unlock()

	if err := c.write(msg); err != nil {
		c.removePending(key)
		return nil, err
	}

	select {
	case response := <-responseCh:
		if response.err != nil {
			return nil, response.err
		}
		if response.msg.Error != nil {
			return nil, response.msg.Error.err()
		}
		if response.msg.Result == nil {
			return nil, nil
		}
		return append(json.RawMessage(nil), (*response.msg.Result)...), nil
	case <-ctx.Done():
		c.removePending(key)
		return nil, ctx.Err()
	}
}

func (c *Client) notify(method string, params any) error {
	msg, err := makeRPCNotification(method, params)
	if err != nil {
		return err
	}
	return c.write(msg)
}

func (c *Client) write(msg rpcMessage) error {
	c.mu.Lock()
	writer := c.rpcWriter
	closed := c.closed
	c.mu.Unlock()
	if closed {
		return errors.New(errClientClosedText)
	}
	if writer == nil {
		return errors.New("mcp client not started")
	}

	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	return writeRPCMessage(writer, msg)
}

func (c *Client) readLoop(reader io.Reader, done chan<- error) {
	var finalErr error
	defer func() {
		c.failPending(finalErr)
		close(c.notifications)
		done <- finalErr
	}()

	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 0, 64*1024), maxRPCLineBytes)
	for scanner.Scan() {
		var msg rpcMessage
		if err := json.Unmarshal(scanner.Bytes(), &msg); err != nil {
			finalErr = err
			return
		}
		if isRPCResponse(msg) {
			c.dispatchResponse(msg)
			continue
		}
		c.dispatchNotification(msg)
	}
	finalErr = scanner.Err()
	if finalErr == nil {
		finalErr = errors.New("mcp transport closed")
	}
}

func (c *Client) dispatchResponse(msg rpcMessage) {
	key := idKey(msg.ID)
	c.mu.Lock()
	ch := c.pending[key]
	delete(c.pending, key)
	c.mu.Unlock()

	if ch != nil {
		ch <- rpcResponse{msg: msg}
	}
}

func (c *Client) dispatchNotification(msg rpcMessage) {
	select {
	case c.notifications <- msg:
	default:
	}
}

func (c *Client) failPending(err error) {
	if err == nil {
		return
	}

	c.mu.Lock()
	pending := c.pending
	c.pending = make(map[string]chan rpcResponse)
	c.mu.Unlock()

	for _, ch := range pending {
		ch <- rpcResponse{err: err}
	}
}

func (c *Client) removePending(key string) {
	c.mu.Lock()
	delete(c.pending, key)
	c.mu.Unlock()
}

type initializeParams struct {
	ProtocolVersion string             `json:"protocolVersion"`
	Capabilities    map[string]any     `json:"capabilities"`
	ClientInfo      implementationInfo `json:"clientInfo"`
}

type implementationInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type callToolParams struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments,omitempty"`
}

func contentText(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}

	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		return text
	}

	var blocks []struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &blocks); err == nil {
		var b strings.Builder
		for _, block := range blocks {
			b.WriteString(block.Text)
		}
		return b.String()
	}

	return string(raw)
}

func inferCloser(reader io.Reader, writer io.Writer, closeFn func() error) io.Closer {
	if closeFn != nil {
		return closeFunc(closeFn)
	}
	var closers multiCloser
	if closer, ok := reader.(io.Closer); ok {
		closers = append(closers, closer)
	}
	if closer, ok := writer.(io.Closer); ok {
		closers = append(closers, closer)
	}
	if len(closers) > 0 {
		return closers
	}
	return nil
}

type closeFunc func() error

func (fn closeFunc) Close() error {
	return fn()
}

type multiCloser []io.Closer

func (closers multiCloser) Close() error {
	var firstErr error
	for _, closer := range closers {
		if closer == nil {
			continue
		}
		if err := closer.Close(); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

type processTransport struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser

	waitOnce sync.Once
	waitErr  error
}

func startProcessTransport(spec ServerSpec) (*processTransport, error) {
	if spec.Command == "" {
		return nil, errors.New("mcp server command is empty")
	}

	cmd := exec.Command(spec.Command, spec.Args...)
	cmd.Env = append(os.Environ(), spec.Env...)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		_ = stdin.Close()
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		_ = stdin.Close()
		_ = stdout.Close()
		return nil, err
	}

	return &processTransport{cmd: cmd, stdin: stdin, stdout: stdout}, nil
}

func (t *processTransport) Close() error {
	if t == nil {
		return nil
	}
	if t.stdin != nil {
		_ = t.stdin.Close()
	}
	if t.stdout != nil {
		_ = t.stdout.Close()
	}
	if t.cmd != nil && t.cmd.Process != nil {
		_ = t.cmd.Process.Kill()
	}
	_ = t.Wait()
	return nil
}

func (t *processTransport) Wait() error {
	if t == nil || t.cmd == nil {
		return nil
	}
	t.waitOnce.Do(func() {
		t.waitErr = t.cmd.Wait()
	})
	return t.waitErr
}
