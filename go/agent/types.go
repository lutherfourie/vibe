package agent

import (
	"context"
	"encoding/json"
	"fmt"
)

// Role identifies the source of a conversation message.
type Role string

const (
	RoleSystem    Role = "system"
	RoleUser      Role = "user"
	RoleAssistant Role = "assistant"
	RoleTool      Role = "tool"
)

// Message is one conversation item passed to a provider.
type Message struct {
	Role    Role   `json:"role"`
	Content string `json:"content"`
}

// ToolSpec describes a tool available to a provider.
type ToolSpec struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Schema      json.RawMessage `json:"schema,omitempty"`
}

// ToolCall represents a provider request to execute a tool.
type ToolCall struct {
	ID   string          `json:"id"`
	Name string          `json:"name"`
	Args json.RawMessage `json:"args,omitempty"`
}

// ToolResult represents the result of a tool execution.
type ToolResult struct {
	ID      string `json:"id"`
	Content string `json:"content"`
	IsError bool   `json:"isError"`
}

// Usage captures provider-reported token and cost metadata.
type Usage struct {
	InputTokens  int     `json:"inputTokens"`
	OutputTokens int     `json:"outputTokens"`
	CostUSD      float64 `json:"costUsd"`
}

// ---------------------------------------------------------------------------
// Modern Vibe declarations execution support (Tool/Eval/Template/Policy/Workflow)
// Added to support grammar extensions and autonomous lane plans.
// Industry best practice: StepExecutor models a discrete activity (Temporal
// Activity, LangChain/LangGraph node, Cadence workflow activity).
// Stubs provide simulation + registration so loop can drive Pawfall-style
// asset review flows without external deps yet.
// ---------------------------------------------------------------------------

// VibeStep is a runtime view of a step (discriminated on Type) for execution
// inside RunLoop or custom autonomous runners. Mirrors lanes.Step.
type VibeStep struct {
	Type       string
	Tool       string
	Eval       string
	Template   string
	Workflow   string
	Dimensions []string
	Threshold  float64
	If         string
	Then       string
	Checkpoint string
	Args       map[string]any
}

// VibeDeclarations carries the parsed Tool/Eval/etc from a lane Plan into the
// agent runtime for registration and resolution during execution.
type VibeDeclarations struct {
	Tools             []VibeTool
	Evals             []VibeEval
	Templates         []VibeTemplate
	Policies          []VibePolicy
	Workflows         []VibeWorkflow
	Characters        []VibeCharacter
	FrameReviews      []VibeFrameReview
	ConsistencyGuards []VibeConsistencyGuard
}

type VibeTool struct {
	Name        string
	Description string
	Schema      map[string]any
	Provider    string
	MCP         string
}

type VibeEval struct {
	Name      string
	Criteria  []string
	Threshold float64
	LLM       string
}

type VibeTemplate struct {
	Name      string
	Prompt    string
	Variables []string
}

type VibePolicy struct {
	Name         string
	Sandbox      bool
	RateLimit    int
	AllowedTools []string
}

type VibeWorkflow struct {
	Name     string
	Steps    []string
	Parallel bool
	Retries  int
	Policy   string
}

type VibeCharacter struct {
	Name             string
	ReferencePrompt  string
	ReferenceImage   string
	ConsistencyRules []string
}

type VibeFrameReview struct {
	Name            string
	Animation       string
	Dimensions      []string
	ExpertRoles     []string
	Threshold       float64
	KumaConsistency bool
}

type VibeConsistencyGuard struct {
	Name            string
	Character       string
	Rules           []string
	ReferenceImage  string
	AutoRegenOnFail bool
	ExpertPanel     []string
}

// StepExecutor executes one step from the modern declarations (Temporal activity style).
// Implementations live in providers or loop users; default impls simulate.
type StepExecutor interface {
	// ExecuteVibeStep runs a single declared step (tool call, eval score, etc).
	// Compatible with existing ToolExecutor; callers can bridge.
	ExecuteVibeStep(ctx context.Context, step VibeStep, decls *VibeDeclarations) (result any, err error)
}

// DefaultStepExecutor is a no-external-dep simulation implementation used for
// tests and early autonomous runs. Ties directly to Pawfall asset review example:
// - tool "generate_cat_frame" / "expert_review" -> simulated invoke + result
// - eval "expert_review" -> returns a passing score (4.8) or simulated
// - template render -> simple variable interpolation
// - policy -> allow/deny stub
// - workflow -> traverse graph stub
type DefaultStepExecutor struct {
	registeredTools map[string]VibeTool // populated via RegisterVibeTool etc.
}

var _ StepExecutor = (*DefaultStepExecutor)(nil)

func NewDefaultStepExecutor() *DefaultStepExecutor {
	return &DefaultStepExecutor{registeredTools: map[string]VibeTool{}}
}

// RegisterVibeTool makes a declared tool available to step execution (and loop).
func (e *DefaultStepExecutor) RegisterVibeTool(t VibeTool) {
	if e.registeredTools == nil {
		e.registeredTools = map[string]VibeTool{}
	}
	e.registeredTools[t.Name] = t
}

// ExecuteVibeStep provides basic stubs. Real impls would call MCP, LLM evals,
// template engines, or a workflow engine.
func (e *DefaultStepExecutor) ExecuteVibeStep(ctx context.Context, step VibeStep, decls *VibeDeclarations) (any, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	switch step.Type {
	case "tool":
		// Tool registration + stub execution. For Pawfall: generate_cat_frame returns asset ref.
		name := step.Tool
		if name == "" {
			name = "unknown-tool"
		}
		if t, ok := e.registeredTools[name]; ok {
			return map[string]any{"tool": name, "status": "invoked", "desc": t.Description, "simulated": true}, nil
		}
		return map[string]any{"tool": name, "status": "executed-sim", "simulated": true}, nil
	case "eval":
		// Eval scoring simulation. Pawfall expert-cat-review / expert_review:
		// returns score above threshold to simulate approval path.
		score := 4.7
		if step.Threshold > 0 {
			score = step.Threshold + 0.3 // simulate pass
		}
		dims := step.Dimensions
		if len(dims) == 0 && decls != nil {
			for _, ev := range decls.Evals {
				if ev.Name == step.Eval {
					dims = ev.Criteria
					if ev.Threshold > 0 {
						score = ev.Threshold + 0.2
					}
				}
			}
		}
		return map[string]any{
			"eval":    step.Eval,
			"score":   score,
			"passed":  score >= 4.2,
			"dimensions": dims,
			"detail":  "simulated expert review (Pawfall asset review tie-in)",
		}, nil
	case "template":
		// Render stub: naive {var} replacement.
		prompt := "rendered template"
		if decls != nil {
			for _, tm := range decls.Templates {
				if tm.Name == step.Template {
					prompt = tm.Prompt
					for _, v := range tm.Variables {
						if val, ok := step.Args[v]; ok {
							// simplistic
							prompt = stringsReplace(prompt, "{"+v+"}", fmt.Sprintf("%v", val))
						}
					}
				}
			}
		}
		return map[string]any{"template": step.Template, "rendered": prompt}, nil
	case "policy":
		// Policy enforcement stub.
		polName := "asset-policy"
		if step.Args != nil {
			if v, ok := step.Args["policy"].(string); ok && v != "" {
				polName = v
			}
		}
		if decls != nil {
			for _, pol := range decls.Policies {
				if pol.Name == polName {
					allowed := true
					if len(pol.AllowedTools) > 0 {
						// simplistic allow list check in full impl
					}
					return map[string]any{"policy": pol.Name, "enforced": true, "allowed": allowed}, nil
				}
			}
		}
		return map[string]any{"policy": polName, "enforced": true, "allowed": true}, nil
	case "workflow":
		// Workflow graph stub (sequential for now; parallel flag noted).
		wfName := step.Workflow
		steps := []string{}
		if decls != nil {
			for _, w := range decls.Workflows {
				if w.Name == wfName {
					steps = w.Steps
				}
			}
		}
		return map[string]any{"workflow": wfName, "executedSteps": steps, "graphSim": true}, nil
	case "character":
		// Character lock for exact visual consistency (Kuma orange tabby reference).
		return map[string]any{"character": step.Args["character"], "status": "locked-to-reference", "kuma-consistency": true, "simulated": true}, nil
	case "frame-review":
		// Per-frame expert review gate with Kuma fidelity.
		score := 4.85
		if step.Threshold > 0 {
			score = step.Threshold + 0.15
		}
		return map[string]any{"frame-review": step.Args["frameReview"], "score": score, "kuma-match": true, "passed": score >= 4.7, "simulated": true}, nil
	case "consistency-guard":
		// Industry-standard consistency guard for asset/character pipelines.
		return map[string]any{"guard": step.Args["consistencyGuard"], "status": "enforced", "auto-regen-on-fail": true, "simulated": true}, nil
	default:
		return map[string]any{"type": step.Type, "simulated": true}, nil
	}
}

// helpers for stub (avoid importing more)
func stringsReplace(s, old, new string) string {
	// minimal replace for template sim; real would use text/template
	out := ""
	for {
		idx := indexOf(s, old)
		if idx < 0 {
			return out + s
		}
		out += s[:idx] + new
		s = s[idx+len(old):]
	}
}

func indexOf(s, sub string) int {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
