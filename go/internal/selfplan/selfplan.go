package selfplan

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type Plan struct {
	Name     string    `json:"name"`
	Source   string    `json:"source"`
	Repo     string    `json:"repo"`
	Surfaces []Surface `json:"surfaces,omitempty"`
	Lanes    []Lane    `json:"lanes"`
	Gates    []Lane    `json:"gates,omitempty"`
}

type Surface struct {
	Name string `json:"name"`
	Kind string `json:"kind,omitempty"`
	Mode string `json:"mode,omitempty"`
}

type Lane struct {
	Name     string   `json:"name"`
	Impl     string   `json:"impl,omitempty"`
	Owns     string   `json:"owns,omitempty"`
	Emits    string   `json:"emits,omitempty"`
	Target   string   `json:"target,omitempty"`
	Reads    []string `json:"reads,omitempty"`
	Verify   []string `json:"verify,omitempty"`
	Approval string   `json:"approval,omitempty"`
}

func Load(path string) (Plan, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Plan{}, fmt.Errorf("read self-plan: %w", err)
	}
	return Parse(raw)
}

func Parse(raw []byte) (Plan, error) {
	var plan Plan
	if err := json.Unmarshal(raw, &plan); err != nil {
		return Plan{}, fmt.Errorf("parse self-plan JSON: %w", err)
	}
	if strings.TrimSpace(plan.Name) == "" {
		return Plan{}, fmt.Errorf("self-plan name is required")
	}
	return plan, nil
}

func WriteMermaid(plan Plan, outPath string) error {
	if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
		return fmt.Errorf("create graph directory: %w", err)
	}
	if err := os.WriteFile(outPath, []byte(Mermaid(plan)), 0o644); err != nil {
		return fmt.Errorf("write mermaid graph: %w", err)
	}
	return nil
}

func Mermaid(plan Plan) string {
	var b strings.Builder
	b.WriteString("flowchart LR\n")
	if strings.TrimSpace(plan.Name) != "" {
		fmt.Fprintf(&b, "  plan[%q]\n", plan.Name)
	}

	for _, lane := range plan.Lanes {
		laneID := nodeID("lane_" + lane.Name)
		fmt.Fprintf(&b, "  %s[%q]\n", laneID, lane.Name)
		if strings.TrimSpace(plan.Name) != "" {
			fmt.Fprintf(&b, "  plan --> %s\n", laneID)
		}
		if lane.Target != "" {
			targetID := nodeID(lane.Target)
			fmt.Fprintf(&b, "  %s[%q]\n", targetID, lane.Target)
			fmt.Fprintf(&b, "  %s --> %s\n", laneID, targetID)
		}
		if lane.Owns != "" {
			ownsID := nodeID("owns_" + lane.Name)
			fmt.Fprintf(&b, "  %s[%q]\n", ownsID, lane.Owns)
			fmt.Fprintf(&b, "  %s -. owns .-> %s\n", laneID, ownsID)
		}
		if len(lane.Verify) > 0 {
			verifyID := nodeID("verify_" + lane.Name)
			fmt.Fprintf(&b, "  %s -. verifies .-> %s[%q]\n", laneID, verifyID, strings.Join(lane.Verify, "\\n"))
		}
	}

	return b.String()
}

func DashboardHTML(plan Plan, graph string) string {
	var b bytes.Buffer
	b.WriteString("<!doctype html><html><head><meta charset=\"utf-8\">")
	b.WriteString("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">")
	b.WriteString("<title>Vibe Admin</title>")
	b.WriteString("<style>body{font-family:system-ui,sans-serif;margin:2rem;line-height:1.45}pre{background:#f4f4f5;padding:1rem;overflow:auto}.lane{border:1px solid #ddd;border-radius:8px;padding:1rem;margin:.75rem 0}</style>")
	b.WriteString("</head><body>")
	fmt.Fprintf(&b, "<h1>%s</h1>", html.EscapeString(plan.Name))
	b.WriteString("<p>Local-first Vibe admin surface generated from <code>docs/examples/vibe-self-plan.json</code>.</p>")
	b.WriteString("<h2>Lanes</h2>")
	for _, lane := range plan.Lanes {
		b.WriteString("<section class=\"lane\">")
		fmt.Fprintf(&b, "<h3>%s</h3>", html.EscapeString(lane.Name))
		if lane.Target != "" {
			fmt.Fprintf(&b, "<p><strong>Target:</strong> %s</p>", html.EscapeString(lane.Target))
		}
		if lane.Owns != "" {
			fmt.Fprintf(&b, "<p><strong>Owns:</strong> %s</p>", html.EscapeString(lane.Owns))
		}
		if lane.Emits != "" {
			fmt.Fprintf(&b, "<p>%s</p>", html.EscapeString(lane.Emits))
		}
		b.WriteString("</section>")
	}
	b.WriteString("<h2>Mermaid</h2><pre>")
	b.WriteString(html.EscapeString(graph))
	b.WriteString("</pre></body></html>")
	return b.String()
}

var nonNodeID = regexp.MustCompile(`[^A-Za-z0-9_]`)

func nodeID(value string) string {
	value = nonNodeID.ReplaceAllString(value, "_")
	value = strings.Trim(value, "_")
	if value == "" {
		return "node"
	}
	return value
}
