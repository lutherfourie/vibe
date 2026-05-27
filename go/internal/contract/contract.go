// Package contract validates Vibe IR documents against the canonical JSON
// Schemas checked into the repo-root schemas/ directory. The schemas are the
// shared source of truth between @vibe/language (TypeScript) and the Go runtime;
// see schemas/README.md.
package contract

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v5"
)

// Canonical schema filenames under the repo-root schemas/ directory.
const (
	SelfPlanSchema = "vibe-self-plan.schema.json"
	LanePlanSchema = "vibe-lane-plan.schema.json"
)

var (
	schemaCacheMu sync.Mutex
	schemaCache   = map[string]*jsonschema.Schema{}
)

// Validate checks raw JSON against the named canonical schema (one of the
// *Schema consts). It returns a wrapped error naming the schema on failure, so
// callers and tests can attribute the violation. A nil error means raw conforms.
func Validate(schemaFile string, raw []byte) error {
	sch, err := loadSchema(schemaFile)
	if err != nil {
		return err
	}

	var doc interface{}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return fmt.Errorf("parse JSON for %s: %w", schemaFile, err)
	}

	if err := sch.Validate(doc); err != nil {
		return fmt.Errorf("schema %s: %w", schemaFile, err)
	}
	return nil
}

// loadSchema compiles and caches the named schema from the repo-root schemas/
// directory. Compilation is cached per schema file so repeated validation (e.g.
// across many lanes) does not recompile.
func loadSchema(schemaFile string) (*jsonschema.Schema, error) {
	schemaCacheMu.Lock()
	defer schemaCacheMu.Unlock()

	if sch, ok := schemaCache[schemaFile]; ok {
		return sch, nil
	}

	dir, err := schemasDir()
	if err != nil {
		return nil, err
	}
	path := filepath.Join(dir, schemaFile)
	sch, err := jsonschema.Compile(path)
	if err != nil {
		return nil, fmt.Errorf("compile schema %s: %w", schemaFile, err)
	}

	schemaCache[schemaFile] = sch
	return sch, nil
}

// schemasDir locates the repo-root schemas/ directory by walking up from the
// current working directory until it finds the directory holding
// pnpm-workspace.yaml (the workspace root). This mirrors how the CLI resolves
// the repo root and keeps the canonical schemas as the single source of truth.
func schemasDir() (string, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("resolve working directory: %w", err)
	}
	for dir := cwd; ; {
		if _, err := os.Stat(filepath.Join(dir, "pnpm-workspace.yaml")); err == nil {
			return filepath.Join(dir, "schemas"), nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("schemas directory not found above %s (no pnpm-workspace.yaml)", cwd)
		}
		dir = parent
	}
}
