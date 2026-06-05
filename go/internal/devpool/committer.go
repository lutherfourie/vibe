package devpool

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// ErrNothingStaged is returned by Commit when, after staging the scope globs,
// the index holds no changes to commit (the subagent produced no in-scope edit).
var ErrNothingStaged = errors.New("devpool: nothing staged to commit")

// Committer stages scoped changes and commits them. It NEVER pushes and NEVER
// runs `git add -A`: only the explicit scope globs are staged, so build/agent
// artifacts outside the scope can never sneak into a commit.
type Committer interface {
	// Commit stages files matching scopeGlobs in dir, commits them with message,
	// and returns the new commit SHA. It returns ErrNothingStaged when the staged
	// set is empty.
	Commit(ctx context.Context, dir, message string, scopeGlobs []string) (sha string, err error)
	// Discard resets the worktree to a clean state (hard reset + remove untracked).
	Discard(ctx context.Context, dir string) error
}

// GitCommitter implements Committer via the git CLI. It does not retain state;
// the worktree directory is passed per call.
type GitCommitter struct {
	// GitBin is the git executable. Empty resolves "git" on PATH.
	GitBin string
	// AuthorName/AuthorEmail, when set, are passed via -c so commits succeed even
	// in a worktree without configured identity (common in CI/sandboxes). Empty
	// values fall back to the repo/global git config.
	AuthorName  string
	AuthorEmail string
}

var _ Committer = (*GitCommitter)(nil)

// Commit stages the scope globs in dir and commits them, returning the SHA.
//
// Staging uses `git add -- <glob>...` with literal-ish pathspecs (git expands
// globs itself). If no scope globs are given, nothing is staged and the call
// fails with ErrNothingStaged rather than silently committing everything — the
// scope is a required safety boundary, not an optional filter.
func (c *GitCommitter) Commit(ctx context.Context, dir, message string, scopeGlobs []string) (string, error) {
	globs := nonEmpty(scopeGlobs)
	if len(globs) == 0 {
		return "", fmt.Errorf("%w: no scope globs provided", ErrNothingStaged)
	}

	// Stage only the explicit scope globs (NEVER -A). `git add` exits non-zero
	// with "pathspec ... did not match any files" only when NONE of the globs
	// matched anything — which is precisely the "no in-scope edit" case, so we map
	// it to ErrNothingStaged instead of a hard failure. (If at least one glob
	// matches, git succeeds and silently ignores the non-matching ones.)
	addArgs := append([]string{"add", "--"}, globs...)
	if out, err := c.git(ctx, dir, addArgs...); err != nil {
		if isPathspecNoMatch(out) {
			return "", fmt.Errorf("%w: scope matched no files", ErrNothingStaged)
		}
		return "", err
	}

	// Bail out if the scoped add produced no staged change (e.g. the matched
	// files were unmodified). `git diff --cached --quiet` exits 1 when there ARE
	// staged changes, 0 when there are none.
	if clean, err := c.indexClean(ctx, dir); err != nil {
		return "", err
	} else if clean {
		return "", ErrNothingStaged
	}

	commitArgs := c.identityArgs()
	commitArgs = append(commitArgs, "commit", "-m", message)
	if _, err := c.git(ctx, dir, commitArgs...); err != nil {
		return "", err
	}

	sha, err := c.git(ctx, dir, "rev-parse", "HEAD")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(sha), nil
}

// Discard restores dir to a pristine state: `git reset --hard` drops tracked
// changes, `git clean -fd` removes untracked files and directories. It never
// touches anything outside dir.
func (c *GitCommitter) Discard(ctx context.Context, dir string) error {
	if _, err := c.git(ctx, dir, "reset", "--hard"); err != nil {
		return err
	}
	if _, err := c.git(ctx, dir, "clean", "-fd"); err != nil {
		return err
	}
	return nil
}

// indexClean reports whether the staged index has no changes relative to HEAD.
func (c *GitCommitter) indexClean(ctx context.Context, dir string) (bool, error) {
	bin := c.bin()
	cmd := exec.CommandContext(ctx, bin, "diff", "--cached", "--quiet")
	cmd.Dir = dir
	cmd.Env = os.Environ()
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	if err == nil {
		return true, nil // exit 0 => no staged diff
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		if exitErr.ExitCode() == 1 {
			return false, nil // exit 1 => staged changes present
		}
	}
	return false, fmt.Errorf("devpool: git diff --cached: %w: %s", err, strings.TrimSpace(out.String()))
}

func (c *GitCommitter) identityArgs() []string {
	var args []string
	if strings.TrimSpace(c.AuthorName) != "" {
		args = append(args, "-c", "user.name="+c.AuthorName)
	}
	if strings.TrimSpace(c.AuthorEmail) != "" {
		args = append(args, "-c", "user.email="+c.AuthorEmail)
	}
	return args
}

func (c *GitCommitter) bin() string {
	if c.GitBin != "" {
		return c.GitBin
	}
	return "git"
}

func (c *GitCommitter) git(ctx context.Context, dir string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, c.bin(), args...)
	cmd.Dir = dir
	cmd.Env = os.Environ()
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	if err := cmd.Run(); err != nil {
		return out.String(), fmt.Errorf("devpool: git %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(out.String()))
	}
	return out.String(), nil
}

// isPathspecNoMatch reports whether git output indicates the only failure was an
// unmatched pathspec (i.e. the scope matched nothing). Git's wording is stable:
// "did not match any files".
func isPathspecNoMatch(gitOutput string) bool {
	return strings.Contains(gitOutput, "did not match any files")
}

func nonEmpty(in []string) []string {
	out := make([]string, 0, len(in))
	for _, s := range in {
		if strings.TrimSpace(s) != "" {
			out = append(out, s)
		}
	}
	return out
}
