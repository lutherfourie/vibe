package lanes

// Plan is the v0 JSON IR consumed by the Go runtime spike.
// Extended with modern declarations from the vibe grammar (Tool/Eval/Template/Policy/Workflow)
// for autonomous workflows. These are optional; existing autonomous lane plans
// (e.g. vibe-autonomous-lanes.json, pawfall-feedback-lanes.json) parse unchanged.
type Plan struct {
	Name  string `json:"name"`
	Repo  string `json:"repo"`
	Lanes []Lane `json:"lanes"`

	// Modern declarations (top-level in .vibe sources; carried in lane-plan IR for
	// the Go coordinator + step executors). Tied to Pawfall asset-review patterns.
	Tools        []Tool        `json:"tools,omitempty"`
	Evals        []Eval        `json:"evals,omitempty"`
	Templates    []Template    `json:"templates,omitempty"`
	Policies     []Policy      `json:"policies,omitempty"`
	Workflows    []Workflow    `json:"workflows,omitempty"`
	Characters        []Character        `json:"characters,omitempty"`
	FrameReviews      []FrameReview      `json:"frameReviews,omitempty"`
	ConsistencyGuards []ConsistencyGuard `json:"consistencyGuards,omitempty"`
}

// Lane declares one isolated unit of agentic work.
type Lane struct {
	Name     string   `json:"name"`
	Mode     string   `json:"mode"`
	Branch   string   `json:"branch,omitempty"`
	Reads    []string `json:"reads,omitempty"`
	Writes   []string `json:"writes,omitempty"`
	Prompt   string   `json:"prompt"`
	Requires []string `json:"requires,omitempty"`

	// Autonomous carries long-horizon config for a mode=="autonomous" lane.
	// It is nil for codex.web / local lanes and ignored by their generators.
	Autonomous *Autonomous `json:"autonomous,omitempty"`

	// Steps enable modern structured execution for autonomous lanes using
	// the new Tool/Eval/Template/Policy/Workflow declarations (Pawfall asset review).
	// Legacy lanes omit this; coordinator + loop remain compatible.
	Steps []Step `json:"steps,omitempty"`
}

// Autonomous is the namespaced config block for an autonomous lane: the durable,
// resume-from-checkpoint long-horizon work kind. All fields are optional; the
// prompt generator supplies defaults (Progress -> "PROGRESS.md", a standard role
// set, and a checkpoint cadence) when they are empty.
type Autonomous struct {
	Progress        string   `json:"progress,omitempty"`        // PROGRESS.md path the lane maintains
	Horizon         string   `json:"horizon,omitempty"`         // freeform, e.g. "long", "multi-session"
	CheckpointEvery string   `json:"checkpointEvery,omitempty"` // cadence hint
	Roles           []string `json:"roles,omitempty"`           // multi-agent roles to rotate through
	Research        string   `json:"research,omitempty"`        // research-notes dir the lane appends to
}

// Tool, Eval, Template, Policy, Workflow are the modern vibe declarations
// (added to grammar in vibe.langium) for structured agentic work.
// They are carried at Plan level (or referenced from Lane.Steps) so
// autonomous lanes and step executors can resolve them. Legacy lane plans
// remain fully compatible (fields are optional).
type Tool struct {
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	Schema      map[string]any `json:"schema,omitempty"`
	Provider    string         `json:"provider,omitempty"`
	MCP         string         `json:"mcp,omitempty"`
}

type Eval struct {
	Name      string   `json:"name"`
	Criteria  []string `json:"criteria,omitempty"`
	Threshold float64  `json:"threshold,omitempty"`
	LLM       string   `json:"llm,omitempty"`
}

type Template struct {
	Name      string   `json:"name"`
	Prompt    string   `json:"prompt"`
	Variables []string `json:"variables,omitempty"`
}

type Policy struct {
	Name         string   `json:"name"`
	Sandbox      bool     `json:"sandbox,omitempty"`
	RateLimit    int      `json:"rateLimit,omitempty"`
	AllowedTools []string `json:"allowedTools,omitempty"`
}

type Workflow struct {
	Name     string   `json:"name"`
	Steps    []string `json:"steps,omitempty"`
	Parallel bool     `json:"parallel,omitempty"`
	Retries  int      `json:"retries,omitempty"`
	Policy   string   `json:"policy,omitempty"`
}

// Step models one executable unit inside an autonomous lane (industry pattern:
// Temporal Activity / LangGraph node / AWS Step Functions state).
// The "type" discriminator selects Tool/Eval/Template/Policy/Workflow semantics.
// Used by step executors in the agent loop / providers.
type Step struct {
	Type string `json:"type"` // "tool" | "eval" | "template" | "policy" | "workflow" | "checkpoint"

	// Common refs
	Tool     string `json:"tool,omitempty"`
	Eval     string `json:"eval,omitempty"`
	Template string `json:"template,omitempty"`
	Workflow string `json:"workflow,omitempty"`

	// Eval-specific (Pawfall expert_review example)
	Dimensions []string `json:"dimensions,omitempty"`
	Threshold  float64  `json:"threshold,omitempty"`

	// Control flow for workflow graphs
	If         string `json:"if,omitempty"`
	Then       string `json:"then,omitempty"`
	Checkpoint string `json:"checkpoint,omitempty"`

	// Generic args / forEach etc from .vibe
	Args map[string]any `json:"args,omitempty"`
}

// Handoff is a generated artifact for a lane.
type Handoff struct {
	LaneName string
	Mode     string
	Path     string
}

// EmitResult reports artifacts written by a coordination run.
type EmitResult struct {
	Handoffs []Handoff
}

// Modern declarations for asset/character consistency and per-frame expert review (Kuma/Pawfall production lanes).
type Character struct {
	Name             string   `json:"name"`
	ReferencePrompt  string   `json:"referencePrompt"`
	ReferenceImage   string   `json:"referenceImage,omitempty"`
	ConsistencyRules []string `json:"consistencyRules,omitempty"`
}

type FrameReview struct {
	Name            string   `json:"name"`
	Animation       string   `json:"animation"`
	Dimensions      []string `json:"dimensions"`
	ExpertRoles     []string `json:"expertRoles"`
	Threshold       float64  `json:"threshold"`
	KumaConsistency bool     `json:"kumaConsistency"`
}

type ConsistencyGuard struct {
	Name            string   `json:"name"`
	Character       string   `json:"character"`
	Rules           []string `json:"rules"`
	ReferenceImage  string   `json:"referenceImage,omitempty"`
	AutoRegenOnFail bool     `json:"autoRegenOnFail"`
	ExpertPanel     []string `json:"expertPanel,omitempty"`
}
