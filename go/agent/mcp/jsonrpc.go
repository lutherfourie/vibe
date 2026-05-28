package mcp

import (
	"bufio"
	"encoding/json"
	"errors"
)

const jsonRPCVersion = "2.0"

type rpcMessage struct {
	JSONRPC string           `json:"jsonrpc"`
	ID      *json.RawMessage `json:"id,omitempty"`
	Method  string           `json:"method,omitempty"`
	Params  json.RawMessage  `json:"params,omitempty"`
	Result  *json.RawMessage `json:"result,omitempty"`
	Error   *rpcError        `json:"error,omitempty"`
}

type rpcError struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

func (e *rpcError) err() error {
	if e == nil {
		return nil
	}
	if e.Message == "" {
		return errors.New("mcp json-rpc error")
	}
	return errors.New("mcp json-rpc error: " + e.Message)
}

func makeRPCRequest(id int64, method string, params any) (rpcMessage, error) {
	rawID, err := json.Marshal(id)
	if err != nil {
		return rpcMessage{}, err
	}
	rawParams, err := marshalRaw(params)
	if err != nil {
		return rpcMessage{}, err
	}
	return rpcMessage{
		JSONRPC: jsonRPCVersion,
		ID:      rawPtr(rawID),
		Method:  method,
		Params:  rawParams,
	}, nil
}

func makeRPCNotification(method string, params any) (rpcMessage, error) {
	rawParams, err := marshalRaw(params)
	if err != nil {
		return rpcMessage{}, err
	}
	return rpcMessage{
		JSONRPC: jsonRPCVersion,
		Method:  method,
		Params:  rawParams,
	}, nil
}

func writeRPCMessage(w *bufio.Writer, msg rpcMessage) error {
	if msg.JSONRPC == "" {
		msg.JSONRPC = jsonRPCVersion
	}
	raw, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	if _, err := w.Write(raw); err != nil {
		return err
	}
	if err := w.WriteByte('\n'); err != nil {
		return err
	}
	return w.Flush()
}

func writeRPCResult(w *bufio.Writer, id *json.RawMessage, result any) error {
	raw, err := marshalRaw(result)
	if err != nil {
		return err
	}
	if len(raw) == 0 {
		raw = json.RawMessage("null")
	}
	return writeRPCMessage(w, rpcMessage{
		JSONRPC: jsonRPCVersion,
		ID:      copyRawPtr(id),
		Result:  &raw,
	})
}

func writeRPCError(w *bufio.Writer, id *json.RawMessage, code int, message string) error {
	return writeRPCMessage(w, rpcMessage{
		JSONRPC: jsonRPCVersion,
		ID:      copyRawPtr(id),
		Error:   &rpcError{Code: code, Message: message},
	})
}

func marshalRaw(value any) (json.RawMessage, error) {
	if value == nil {
		return nil, nil
	}
	switch typed := value.(type) {
	case json.RawMessage:
		if len(typed) == 0 {
			return nil, nil
		}
		return append(json.RawMessage(nil), typed...), nil
	case *json.RawMessage:
		if typed == nil || len(*typed) == 0 {
			return nil, nil
		}
		return append(json.RawMessage(nil), (*typed)...), nil
	default:
		raw, err := json.Marshal(value)
		if err != nil {
			return nil, err
		}
		return raw, nil
	}
}

func copyRawPtr(raw *json.RawMessage) *json.RawMessage {
	if raw == nil {
		return nil
	}
	return rawPtr(*raw)
}

func rawPtr(raw json.RawMessage) *json.RawMessage {
	copy := append(json.RawMessage(nil), raw...)
	return &copy
}

func idKey(id *json.RawMessage) string {
	if id == nil {
		return ""
	}
	return string(*id)
}

func isRPCResponse(msg rpcMessage) bool {
	return msg.ID != nil && msg.Method == "" && (msg.Result != nil || msg.Error != nil)
}
