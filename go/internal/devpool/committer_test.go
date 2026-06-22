package devpool

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"
)

// seedScopedRepo returns a repo whose initial commit contains src/a.go, src/b.go,
// and README.md, then dirties all three. The returned dir is where the committer
// operates.
func seedScopedRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	runGit(t, dir, "init", "-b", "main")
	configRepo(t, dir)
	writeFile(t, filepath.Join(dir, "src", "a.go"), "package src\n")
	writeFile(t, filepath.Join(dir, "src", "b.go"), "package src\n")
	writeFile(t, filepath.Join(dir, "README.md"), "# base\n")
	runGit(t, dir, "add", ".")
	runGit(t, dir, "commit", "-m", "base")

	// Dirty all three so the scope filter is observable.
	writeFile(t, filepath.Join(dir, "src", "a.go"), "package src\n\n// edit a\n")
	writeFile(t, filepath.Join(dir, "src", "b.go"), "package src\n\n// edit b\n")
	writeFile(t, filepath.Join(dir, "README.md"), "# base\n\nedited readme\n")
	return dir
}

func TestCommitterStagesOnlyScope(t *testing.T) {
	requireGit(t)
	dir := seedScopedRepo(t)
	c := &GitCommitter{}
	ctx := context.Background()

	sha, err := c.Commit(ctx, dir, "scope test", []string{"src/*.go"})
	if err != nil {
		t.Fatalf("Commit: %v", err)
	}
	if len(strings.TrimSpace(sha)) < 7 {
		t.Fatalf("Commit returned a non-SHA: %q", sha)
	}

	// The committed tree must include the src changes but NOT the README change.
	committed := runGit(t, dir, "show", "--name-only", "--pretty=format:", "HEAD")
	if !strings.Contains(committed, "src/a.go") || !strings.Contains(committed, "src/b.go") {
		t.Fatalf("commit missing scoped files; show:\n%s", committed)
	}
	if strings.Contains(committed, "README.md") {
		t.Fatalf("commit unexpectedly included README.md; show:\n%s", committed)
	}

	// README must still be dirty (it was never staged or committed).
	status := runGit(t, dir, "status", "--porcelain")
	if !strings.Contains(status, "README.md") {
		t.Fatalf("expected README.md to remain dirty; status:\n%s", status)
	}
	if strings.Contains(status, "src/a.go") || strings.Contains(status, "src/b.go") {
		t.Fatalf("scoped files should be committed (clean); status:\n%s", status)
	}
}

func TestCommitterEmptyStagedIsError(t *testing.T) {
	requireGit(t)
	dir := seedScopedRepo(t)
	c := &GitCommitter{}
	ctx := context.Background()

	// Scope matches nothing dirty (no .md changes are .txt), so the index is empty.
	_, err := c.Commit(ctx, dir, "noop", []string{"*.txt"})
	if !errors.Is(err, ErrNothingStaged) {
		t.Fatalf("expected ErrNothingStaged for empty scope match, got %v", err)
	}

	// No scope globs at all is also a nothing-staged error (never falls back to -A).
	if _, err := c.Commit(ctx, dir, "noop", nil); !errors.Is(err, ErrNothingStaged) {
		t.Fatalf("expected ErrNothingStaged for nil scope, got %v", err)
	}
}

func TestCommitterDiscardCleansTree(t *testing.T) {
	requireGit(t)
	dir := seedScopedRepo(t)
	// Add an untracked file too, to prove clean -fd removes it.
	writeFile(t, filepath.Join(dir, "untracked.tmp"), "junk\n")
	c := &GitCommitter{}

	if err := c.Discard(context.Background(), dir); err != nil {
		t.Fatalf("Discard: %v", err)
	}
	status := runGit(t, dir, "status", "--porcelain")
	if strings.TrimSpace(status) != "" {
		t.Fatalf("expected clean tree after Discard; status:\n%s", status)
	}
}

func TestCommitterCommitThenCleanTree(t *testing.T) {
	requireGit(t)
	dir := seedScopedRepo(t)
	c := &GitCommitter{}
	ctx := context.Background()
	if _, err := c.Commit(ctx, dir, "commit src", []string{"src/**"}); err != nil {
		t.Fatalf("Commit with ** glob: %v", err)
	}
	// Discard the leftover README dirt; tree should then be pristine.
	if err := c.Discard(ctx, dir); err != nil {
		t.Fatalf("Discard: %v", err)
	}
	if status := strings.TrimSpace(runGit(t, dir, "status", "--porcelain")); status != "" {
		t.Fatalf("tree not clean after commit+discard:\n%s", status)
	}
}
