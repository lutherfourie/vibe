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

	"github.com/lutherfourie/vibe/go/internal/contract"
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

type HandoffExport struct {
	LaneName string
	Path     string
}

func Load(path string) (Plan, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Plan{}, fmt.Errorf("read self-plan: %w", err)
	}
	// Fail fast on contract violations against the canonical self-plan schema
	// before the lenient Parse below. Parse stays permissive so in-memory
	// fixtures in unit tests keep working; Load enforces the full IR contract.
	if err := contract.Validate(contract.SelfPlanSchema, raw); err != nil {
		return Plan{}, fmt.Errorf("validate self-plan %s: %w", path, err)
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

func HandoffFilename(lane Lane) string {
	return nodeID(lane.Name) + ".md"
}

func WriteLaneHandoffs(plan Plan, outDir string) ([]HandoffExport, error) {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return nil, fmt.Errorf("create handoff directory: %w", err)
	}

	exports := make([]HandoffExport, 0, len(plan.Lanes))
	used := map[string]int{}
	for _, lane := range plan.Lanes {
		filename := HandoffFilename(lane)
		if count := used[filename]; count > 0 {
			filename = strings.TrimSuffix(filename, ".md") + fmt.Sprintf("-%d.md", count+1)
		}
		used[HandoffFilename(lane)]++

		outPath := filepath.Join(outDir, filename)
		if err := os.WriteFile(outPath, []byte(LaneHandoff(plan, lane)), 0o644); err != nil {
			return nil, fmt.Errorf("write handoff %s: %w", lane.Name, err)
		}
		exports = append(exports, HandoffExport{
			LaneName: lane.Name,
			Path:     outPath,
		})
	}
	return exports, nil
}

func DashboardHTML(plan Plan, graph string) string {
	var b bytes.Buffer
	b.WriteString("<!doctype html><html><head><meta charset=\"utf-8\">")
	b.WriteString("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">")
	b.WriteString("<title>Vibe Admin</title>")
	b.WriteString("<style>")
	b.WriteString(":root{color-scheme:light;--ink:#171717;--muted:#5f6368;--line:#d7dadf;--panel:#ffffff;--soft:#f6f8fb;--accent:#0f766e;--accent-soft:#d9f3ef;--warn:#8a5a00;--code:#202938}")
	b.WriteString("*{box-sizing:border-box}body{font-family:system-ui,sans-serif;margin:0;line-height:1.45;color:var(--ink);background:#f8fafc}main{max-width:1180px;margin:0 auto;padding:2rem}header{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;border-bottom:1px solid var(--line);padding-bottom:1.25rem;margin-bottom:1.5rem}h1,h2,h3,h4,p{margin-top:0}h1{font-size:2rem;margin-bottom:.35rem}h2{font-size:1.25rem;margin-bottom:.75rem}h3{font-size:1rem;margin-bottom:.35rem}h4{font-size:.92rem;margin-bottom:0}.muted{color:var(--muted)}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--code)}button,.button{border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:6px;padding:.45rem .75rem;font:inherit;cursor:pointer;min-width:4.25rem;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}button:hover,.button:hover{border-color:var(--accent);color:var(--accent)}.section{margin:1.5rem 0}.graph{display:grid;gap:.75rem}.graph-row{display:grid;grid-template-columns:minmax(11rem,1fr) 1.75rem minmax(12rem,1.25fr) minmax(12rem,1.2fr);gap:.5rem;align-items:stretch}.node{border:1px solid var(--line);border-radius:8px;background:var(--panel);padding:.75rem;min-width:0}.node strong{display:block;font-size:.86rem;margin-bottom:.2rem}.node span{display:block;overflow-wrap:anywhere;color:var(--muted);font-size:.88rem}.lane-node{border-color:var(--accent);box-shadow:inset 4px 0 0 var(--accent)}.target-node{background:var(--accent-soft);border-color:#99d8d0}.edge{align-self:center;text-align:center;color:var(--muted);font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.lanes{display:grid;gap:1rem}.lane{border:1px solid var(--line);border-radius:8px;background:var(--panel);padding:1rem}.lane-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem;margin:.75rem 0}.meta{background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:.65rem;min-width:0}.meta b{display:block;font-size:.78rem;text-transform:uppercase;color:var(--muted);font-weight:650;margin-bottom:.2rem}.meta span{overflow-wrap:anywhere}.handoff-head{display:flex;justify-content:space-between;align-items:center;gap:.75rem;margin-top:1rem}.handoff-actions{display:flex;gap:.5rem;flex-wrap:wrap;justify-content:flex-end}.handoff{width:100%;min-height:13rem;resize:vertical;margin-top:.5rem;border:1px solid var(--line);border-radius:6px;padding:.75rem;background:#fbfcfe;color:var(--code);font:0.86rem/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}details{border:1px solid var(--line);border-radius:8px;background:var(--panel);padding:1rem}summary{cursor:pointer;font-weight:650}pre{background:#111827;color:#e5e7eb;padding:1rem;overflow:auto;border-radius:6px}@media (max-width:860px){main{padding:1rem}header{display:block}.graph-row{grid-template-columns:1fr}.edge{text-align:left}.lane-meta{grid-template-columns:1fr}}")
	b.WriteString("</style>")
	b.WriteString("</head><body>")
	b.WriteString("<main>")
	b.WriteString("<header><div>")
	fmt.Fprintf(&b, "<h1>%s</h1>", html.EscapeString(plan.Name))
	fmt.Fprintf(&b, "<p class=\"muted\">Local-first Vibe admin surface generated from <code>%s</code>.</p>", html.EscapeString(plan.Source))
	b.WriteString("</div><div class=\"node\"><strong>Lanes</strong>")
	fmt.Fprintf(&b, "<span>%d active</span>", len(plan.Lanes))
	b.WriteString("</div></header>")
	b.WriteString("<section class=\"section\"><h2>Lane Graph</h2>")
	b.WriteString("<div class=\"graph\">")
	for _, lane := range plan.Lanes {
		b.WriteString("<div class=\"graph-row\">")
		b.WriteString("<div class=\"node lane-node\"><strong>Lane</strong>")
		fmt.Fprintf(&b, "<span>%s</span>", html.EscapeString(lane.Name))
		b.WriteString("</div><div class=\"edge\">-&gt;</div>")
		b.WriteString("<div class=\"node target-node\"><strong>Target</strong>")
		fmt.Fprintf(&b, "<span>%s</span>", html.EscapeString(valueOr(lane.Target, "not declared")))
		b.WriteString("</div>")
		b.WriteString("<div class=\"node\"><strong>Owns</strong>")
		fmt.Fprintf(&b, "<span>%s</span>", html.EscapeString(valueOr(lane.Owns, "not declared")))
		b.WriteString("</div></div>")
	}
	b.WriteString("</div></section>")
	b.WriteString("<section class=\"section\"><h2>Lane Handoffs</h2><div class=\"lanes\">")
	for _, lane := range plan.Lanes {
		handoffID := "handoff-" + nodeID(lane.Name)
		b.WriteString("<section class=\"lane\">")
		fmt.Fprintf(&b, "<h3>%s</h3>", html.EscapeString(lane.Name))
		b.WriteString("<div class=\"lane-meta\">")
		fmt.Fprintf(&b, "<div class=\"meta\"><b>Target</b><span>%s</span></div>", html.EscapeString(valueOr(lane.Target, "not declared")))
		fmt.Fprintf(&b, "<div class=\"meta\"><b>Owns</b><span>%s</span></div>", html.EscapeString(valueOr(lane.Owns, "not declared")))
		fmt.Fprintf(&b, "<div class=\"meta\"><b>Approval</b><span>%s</span></div>", html.EscapeString(valueOr(lane.Approval, "not declared")))
		b.WriteString("</div>")
		if lane.Emits != "" {
			fmt.Fprintf(&b, "<p>%s</p>", html.EscapeString(lane.Emits))
		}
		b.WriteString("<div class=\"handoff-head\"><h4>Agent Handoff</h4>")
		b.WriteString("<div class=\"handoff-actions\">")
		fmt.Fprintf(&b, "<button type=\"button\" data-copy-target=\"%s\">Copy</button>", html.EscapeString(handoffID))
		fmt.Fprintf(&b, "<a class=\"button\" href=\"/handoffs/%s\" download>Download</a>", html.EscapeString(HandoffFilename(lane)))
		b.WriteString("</div></div>")
		fmt.Fprintf(&b, "<textarea id=\"%s\" class=\"handoff\" readonly spellcheck=\"false\">%s</textarea>", html.EscapeString(handoffID), html.EscapeString(LaneHandoff(plan, lane)))
		b.WriteString("</section>")
	}
	b.WriteString("</div></section>")
	b.WriteString("<section class=\"section\"><details><summary>Mermaid source</summary><pre>")
	b.WriteString(html.EscapeString(graph))
	b.WriteString("</pre></details></section>")
	b.WriteString("<script>document.addEventListener('click',async function(event){var button=event.target.closest('[data-copy-target]');if(!button){return;}var target=document.getElementById(button.getAttribute('data-copy-target'));if(!target){return;}try{await navigator.clipboard.writeText(target.value);var previous=button.textContent;button.textContent='Copied';setTimeout(function(){button.textContent=previous;},1400);}catch(error){target.focus();target.select();document.execCommand('copy');}});</script>")
	b.WriteString("</main></body></html>")
	return b.String()
}

func LaneHandoff(plan Plan, lane Lane) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# Vibe Lane Handoff: %s\n\n", lane.Name)
	fmt.Fprintf(&b, "Repo: %s\n", valueOr(plan.Repo, "C:/vibe"))
	fmt.Fprintf(&b, "Self-plan source: %s\n", valueOr(plan.Source, "examples/vibe-self.vibe"))
	fmt.Fprintf(&b, "Target surface: %s\n", valueOr(lane.Target, "not declared"))
	fmt.Fprintf(&b, "Write scope: %s\n\n", valueOr(lane.Owns, "not declared"))

	if len(lane.Reads) > 0 {
		b.WriteString("Read first:\n")
		for _, path := range lane.Reads {
			fmt.Fprintf(&b, "- %s\n", path)
		}
		b.WriteString("\n")
	}

	if strings.TrimSpace(lane.Emits) != "" {
		b.WriteString("Goal:\n")
		fmt.Fprintf(&b, "%s\n\n", lane.Emits)
	}

	if len(lane.Verify) > 0 {
		b.WriteString("Verification:\n")
		for _, command := range lane.Verify {
			fmt.Fprintf(&b, "- %s\n", command)
		}
		b.WriteString("\n")
	}

	fmt.Fprintf(&b, "Approval: %s\n\n", valueOr(lane.Approval, "not declared"))
	b.WriteString("Operating constraints:\n")
	b.WriteString("- Keep edits inside the declared write scope.\n")
	b.WriteString("- Regenerate docs/examples/vibe-self-plan.json with `pnpm run self:plan` only when examples/vibe-self.vibe changes.\n")
	b.WriteString("- Run the lane verification commands before handoff.\n")
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

func valueOr(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
