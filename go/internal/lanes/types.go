package lanes

// Plan is the v0 JSON IR consumed by the Go runtime spike.
type Plan struct {
	Name  string `json:"name"`
	Repo  string `json:"repo"`
	Lanes []Lane `json:"lanes"`
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
