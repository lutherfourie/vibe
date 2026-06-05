package devpool

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// WorktreeManager handles the lifecycle of throwaway git worktrees used to
// isolate one subagent's edits from every other worker.
type WorktreeManager interface {
	// Create adds a worktree for taskID based on baseBranch and returns its path.
	Create(ctx context.Context, taskID, baseBranch string) (worktreePath string, err error)
	// Remove deletes the worktree and prunes its git ref entry.
	Remove(ctx context.Context, worktreePath string) error
	// Path returns the filesystem path Create would use for taskID.
	Path(taskID string) string
}

// GitWorktreeManager drives `git worktree add/remove` against a real repository.
// Worktrees are created under BaseDir (one directory per task). It shells out via
// os/exec and never pushes.
type GitWorktreeManager struct {
	// RepoDir is the path to the source git repository (the main working tree or
	// a bare/non-bare repo) that owns the worktrees.
	RepoDir string
	// BaseDir is the directory under which per-task worktrees are created. It is
	// created on first Create if missing.
	BaseDir string
	// GitBin is the git executable to invoke. Empty resolves "git" on PATH.
	GitBin string
}

// NewGitWorktreeManager constructs a manager rooted at repoDir, placing worktrees
// under baseDir. A blank baseDir defaults to <repoDir>/.vibe-worktrees.
func NewGitWorktreeManager(repoDir, baseDir string) *GitWorktreeManager {
	if strings.TrimSpace(baseDir) == "" {
		baseDir = filepath.Join(repoDir, ".vibe-worktrees")
	}
	return &GitWorktreeManager{RepoDir: repoDir, BaseDir: baseDir}
}

var _ WorktreeManager = (*GitWorktreeManager)(nil)

// Path returns the worktree directory for taskID (sanitized). It does not touch
// the filesystem.
func (m *GitWorktreeManager) Path(taskID string) string {
	return filepath.Join(m.BaseDir, sanitizeTaskID(taskID))
}

// Create adds a fresh worktree for taskID based on baseBranch. A blank baseBranch
// defaults to HEAD. The worktree is created in detached-HEAD mode (we never need
// a named branch for a throwaway, and detaching avoids colliding with an existing
// branch name). Returns the absolute-ish path Path(taskID) would return.
func (m *GitWorktreeManager) Create(ctx context.Context, taskID, baseBranch string) (string, error) {
	id := sanitizeTaskID(taskID)
	if id == "" {
		return "", fmt.Errorf("devpool: empty/unsafe task ID %q", taskID)
	}
	if err := os.MkdirAll(m.BaseDir, 0o755); err != nil {
		return "", fmt.Errorf("devpool: create worktree base dir: %w", err)
	}
	path := m.Path(taskID)
	if _, err := os.Stat(path); err == nil {
		return "", fmt.Errorf("devpool: worktree path already exists: %s", path)
	}

	base := strings.TrimSpace(baseBranch)
	if base == "" {
		base = "HEAD"
	}
	// `--detach` keeps the worktree on a detached HEAD at base, so concurrent
	// tasks based on the same branch don't fight over a branch checkout.
	if _, err := m.git(ctx, "worktree", "add", "--detach", path, base); err != nil {
		return "", err
	}
	return path, nil
}

// Remove deletes the worktree at worktreePath via `git worktree remove --force`
// (force so a dirty tree from a failed attempt is still cleaned up). If the path
// is already gone it still prunes stale administrative entries so a later Create
// for the same task does not collide.
func (m *GitWorktreeManager) Remove(ctx context.Context, worktreePath string) error {
	if strings.TrimSpace(worktreePath) == "" {
		return errors.New("devpool: empty worktree path")
	}
	_, removeErr := m.git(ctx, "worktree", "remove", "--force", worktreePath)
	if removeErr != nil {
		// The worktree may have been deleted out from under git (e.g. a partial
		// failure). Prune the bookkeeping and, as a last resort, delete the dir so
		// the next Create can reuse the path. Surface the original error only if
		// the directory still stubbornly exists afterward.
		_, _ = m.git(ctx, "worktree", "prune")
		if _, statErr := os.Stat(worktreePath); statErr == nil {
			if rmErr := os.RemoveAll(worktreePath); rmErr != nil {
				return fmt.Errorf("devpool: remove worktree %s: %w (rmdir: %v)", worktreePath, removeErr, rmErr)
			}
			_, _ = m.git(ctx, "worktree", "prune")
		}
	}
	return nil
}

func (m *GitWorktreeManager) git(ctx context.Context, args ...string) (string, error) {
	bin := m.GitBin
	if bin == "" {
		bin = "git"
	}
	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Dir = m.RepoDir
	cmd.Env = os.Environ()
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	if err := cmd.Run(); err != nil {
		return out.String(), fmt.Errorf("devpool: git %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(out.String()))
	}
	return out.String(), nil
}

// sanitizeTaskID reduces an arbitrary task ID to a single safe path segment. It
// strips directory separators and parent references so a hostile or sloppy ID can
// never escape BaseDir (e.g. "../../etc" -> "etc"). Characters outside a small
// allowlist become '-'. An ID that sanitizes to empty (e.g. "..") yields "".
func sanitizeTaskID(taskID string) string {
	// Take only the final path element to neutralize embedded separators.
	id := taskID
	id = strings.ReplaceAll(id, "\\", "/")
	if idx := strings.LastIndex(id, "/"); idx >= 0 {
		id = id[idx+1:]
	}
	id = strings.TrimSpace(id)
	if id == "." || id == ".." {
		return ""
	}
	var b strings.Builder
	for _, r := range id {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_', r == '.':
			b.WriteRune(r)
		default:
			b.WriteRune('-')
		}
	}
	out := strings.Trim(b.String(), ".")
	return out
}
