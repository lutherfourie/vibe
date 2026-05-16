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
