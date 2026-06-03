package doctor

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
)

type Requirement struct {
	Name     string `json:"name"`
	Command  string `json:"command"`
	Required bool   `json:"required"`
}

type Check struct {
	Name     string `json:"name"`
	Command  string `json:"command"`
	Required bool   `json:"required"`
	Found    bool   `json:"found"`
	Path     string `json:"path,omitempty"`
	Detail   string `json:"detail,omitempty"`
}

type Report struct {
	OK     bool    `json:"ok"`
	Checks []Check `json:"checks"`
}

func DefaultRequirements() []Requirement {
	return []Requirement{
		{Name: "git", Command: "git", Required: true},
		{Name: "node", Command: "node", Required: true},
		{Name: "pnpm", Command: "pnpm", Required: true},
		{Name: "go", Command: "go", Required: true},
		{Name: "codex", Command: "codex", Required: false},
		// claude: temporarily disabled (claude CLI used by another local project; see VIBE_DISABLE_CLAUDE_CLI + serve registration + .claude.disabled). Doctor still detects the binary if present on PATH.
		{Name: "claude", Command: "claude", Required: false},
		{Name: "obsidian", Command: "obsidian", Required: false},
	}
}

func Run(ctx context.Context, reqs []Requirement) Report {
	report := Report{OK: true}
	for _, req := range reqs {
		check := Check{
			Name:     req.Name,
			Command:  req.Command,
			Required: req.Required,
		}

		select {
		case <-ctx.Done():
			check.Detail = ctx.Err().Error()
		default:
			path, err := exec.LookPath(req.Command)
			if err != nil {
				check.Detail = err.Error()
			} else {
				check.Found = true
				check.Path = path
			}
		}

		if req.Required && !check.Found {
			report.OK = false
		}
		report.Checks = append(report.Checks, check)
	}
	return report
}

func Markdown(report Report) string {
	var b strings.Builder
	if report.OK {
		b.WriteString("# Vibe Doctor: OK\n\n")
	} else {
		b.WriteString("# Vibe Doctor: Missing Required Tools\n\n")
	}

	for _, check := range report.Checks {
		status := "missing"
		if check.Found {
			status = "found"
		}
		required := "optional"
		if check.Required {
			required = "required"
		}
		b.WriteString(fmt.Sprintf("- %s (%s): %s", check.Name, required, status))
		if check.Path != "" {
			b.WriteString(" at `")
			b.WriteString(check.Path)
			b.WriteString("`")
		}
		if check.Detail != "" && !check.Found {
			b.WriteString(" - ")
			b.WriteString(check.Detail)
		}
		b.WriteString("\n")
	}
	return b.String()
}
