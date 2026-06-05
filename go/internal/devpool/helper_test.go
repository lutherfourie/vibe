package devpool

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// requireGit skips the test when git is not on PATH so the suite stays green on
// machines/CI without git, per the brief.
func requireGit(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not found on PATH; skipping real-git test")
	}
}

// runGit runs a git command in dir and fails the test on error.
func runGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.CommandContext(context.Background(), "git", args...)
	cmd.Dir = dir
	cmd.Env = gitTestEnv()
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	if err := cmd.Run(); err != nil {
		t.Fatalf("git %s in %s failed: %v\n%s", strings.Join(args, " "), dir, err, out.String())
	}
	return out.String()
}

// gitTestEnv returns a deterministic committer identity for the test helper.
//
// It intentionally does NOT override GIT_CONFIG_GLOBAL: the production
// GitCommitter/GitWorktreeManager run with the inherited environment, so the
// helper must agree with them on global settings (notably core.autocrlf) or
// line-ending normalization produces phantom diffs that never clean up. Repo
// config is pinned per-repo instead (see configRepo).
func gitTestEnv() []string {
	return append(os.Environ(),
		"GIT_AUTHOR_NAME=devpool-test",
		"GIT_AUTHOR_EMAIL=devpool-test@example.invalid",
		"GIT_COMMITTER_NAME=devpool-test",
		"GIT_COMMITTER_EMAIL=devpool-test@example.invalid",
	)
}

// configRepo pins identity and disables autocrlf locally so tests are
// deterministic regardless of the host's global git config.
func configRepo(t *testing.T, dir string) {
	t.Helper()
	runGit(t, dir, "config", "user.name", "devpool-test")
	runGit(t, dir, "config", "user.email", "devpool-test@example.invalid")
	runGit(t, dir, "config", "core.autocrlf", "false")
	runGit(t, dir, "config", "commit.gpgsign", "false")
}

// initRepo creates a temp git repo with a base commit on branch "main" and
// returns its path. The repo contains an initial README so HEAD exists.
func initRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	runGit(t, dir, "init", "-b", "main")
	configRepo(t, dir)
	writeFile(t, filepath.Join(dir, "README.md"), "# base\n")
	runGit(t, dir, "add", "README.md")
	runGit(t, dir, "commit", "-m", "base commit")
	return dir
}

// writeFile writes content to path, creating parent dirs, failing the test on error.
func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

// worktreeList returns the raw `git worktree list` output for the repo.
func worktreeList(t *testing.T, repoDir string) string {
	t.Helper()
	return runGit(t, repoDir, "worktree", "list")
}
