package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func runIacCompile(args []string) error {
	flags := flag.NewFlagSet("iac-compile", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	source := flags.String("source", "", "path to .vibe file (preferred for P3) or self-plan JSON")
	// NOTE (P4): compileCrewAIFromSource / compileCrewAIFromNode only accepts raw .vibe text.
	// It calls parseVibeSource (Langium) then extractSelfPlan. There is no JSON self-plan
	// ingestion path in the compiler. --source docs/examples/vibe-self-plan.json is accepted
	// by the flag per help text but will fail at parse time. JSON source support deferred to P5.
	// Proven path for P4 is the dedicated .vibe example (examples/crewai-smoke.vibe).
	backend := flags.String("backend", "crewai", "IaC backend (crewai supported now; langgraph not yet)")
	lane := flags.String("lane", "", "optional laneName to pass to compiler")
	outDir := flags.String("out", ".vibe-out/crewai", "output directory for artifacts (crew.py, manifest.json, vibe-contract.md, ...)")
	flags.Usage = func() {
		fmt.Fprintln(flags.Output(), "Usage: vibe iac-compile --source <file.vibe> [--backend crewai] [--lane name] [--out dir]")
		fmt.Fprintln(flags.Output(), "  alias: compile")
		fmt.Fprintln(flags.Output(), "Flags:")
		flags.PrintDefaults()
	}
	if err := flags.Parse(args); err != nil {
		if err == flag.ErrHelp {
			return nil
		}
		return err
	}
	if *source == "" {
		flags.Usage()
		return fmt.Errorf("--source is required")
	}
	if *backend != "crewai" {
		return fmt.Errorf("unknown backend %q (only crewai supported in P3)", *backend)
	}

	root := repoRoot()
	srcPath := resolveRepoPath(*source)
	outPath := resolveRepoPathForWrite(*outDir)
	if err := os.MkdirAll(outPath, 0o755); err != nil {
		return fmt.Errorf("create --out dir: %w", err)
	}

	result, err := compileCrewAIFromNode(root, srcPath, *lane)
	if err != nil {
		return err
	}

	// write artifacts (end-to-end offline)
	if err := os.WriteFile(filepath.Join(outPath, "crew.py"), []byte(result.CrewPy), 0o644); err != nil {
		return fmt.Errorf("write crew.py: %w", err)
	}
	if result.ToolsPy != "" {
		_ = os.WriteFile(filepath.Join(outPath, "tools.py"), []byte(result.ToolsPy), 0o644)
	}
	if result.FlowPy != "" {
		_ = os.WriteFile(filepath.Join(outPath, "flow.py"), []byte(result.FlowPy), 0o644)
	}
	manBytes, _ := json.MarshalIndent(result.Manifest, "", "  ")
	manBytes = append(manBytes, '\n')
	_ = os.WriteFile(filepath.Join(outPath, "manifest.json"), manBytes, 0o644)
	_ = os.WriteFile(filepath.Join(outPath, "vibe-contract.md"), []byte(result.VibeContractMd), 0o644)

	fmt.Fprintf(os.Stdout, "wrote CrewAI IaC artifacts to %s\n", outPath)
	fmt.Fprintln(os.Stdout, "  crew.py")
	if result.ToolsPy != "" {
		fmt.Fprintln(os.Stdout, "  tools.py")
	}
	if result.FlowPy != "" {
		fmt.Fprintln(os.Stdout, "  flow.py")
	}
	fmt.Fprintln(os.Stdout, "  manifest.json")
	fmt.Fprintln(os.Stdout, "  vibe-contract.md")
	if len(result.Diagnostics) > 0 {
		fmt.Fprintf(os.Stdout, "diagnostics: %v\n", result.Diagnostics)
	}
	return nil
}

type crewAICompileResult struct {
	CrewPy         string         `json:"crewPy"`
	ToolsPy        string         `json:"toolsPy,omitempty"`
	FlowPy         string         `json:"flowPy,omitempty"`
	Manifest       map[string]any `json:"manifest"`
	VibeContractMd string         `json:"vibeContractMd"`
	Diagnostics    []string       `json:"diagnostics"`
}

func compileCrewAIFromNode(repoRoot, sourceAbs, laneName string) (crewAICompileResult, error) {
	dist := filepath.Join(repoRoot, "packages", "language", "dist", "index.js")
	if _, err := os.Stat(dist); err != nil {
		return crewAICompileResult{}, fmt.Errorf("CrewAI compiler dist missing at %s — run 'pnpm --filter @vibe/language build' then retry: %w", dist, err)
	}

	js := `import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
(async () => {
	try {
		const srcFile = process.env.SOURCE_FILE || '';
		const lane = process.env.LANE_NAME || '';
		if (!srcFile) throw new Error('SOURCE_FILE env var required');
		const source = fs.readFileSync(srcFile, 'utf8');
		const distURL = pathToFileURL(path.resolve(process.cwd(), 'packages/language/dist/index.js')).href;
		const mod = await import(distURL);
		const fn = mod.compileCrewAIFromSource;
		if (typeof fn !== 'function') throw new Error('compileCrewAIFromSource not exported from dist');
		const opts = lane ? {laneName: lane} : {};
		const res = await fn(source, opts);
		process.stdout.write(JSON.stringify(res));
	} catch (e) {
		console.error('crewai-compile error:', (e && e.stack) || e);
		process.exitCode = 1;
	}
})();`

	cmd := exec.Command("node", "--input-type=module", "-e", js)
	cmd.Dir = repoRoot
	env := append([]string(nil), os.Environ()...)
	env = append(env, "SOURCE_FILE="+sourceAbs)
	if laneName != "" {
		env = append(env, "LANE_NAME="+laneName)
	}
	cmd.Env = env

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return crewAICompileResult{}, fmt.Errorf("node crewai-compile failed: %w\n%s", err, stderr.String())
	}

	var res crewAICompileResult
	raw := stdout.String()
	if err := json.Unmarshal([]byte(raw), &res); err != nil {
		snip := raw
		if len(snip) > 400 {
			snip = snip[:400] + "..."
		}
		return crewAICompileResult{}, fmt.Errorf("unmarshal compile result: %w (raw: %s)", err, snip)
	}
	if res.CrewPy == "" {
		return res, fmt.Errorf("compiler produced empty crewPy (diagnostics=%v)", res.Diagnostics)
	}
	return res, nil
}
