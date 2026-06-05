package devpool

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWorktreeCreateAndRemove(t *testing.T) {
	requireGit(t)
	repo := initRepo(t)
	base := filepath.Join(t.TempDir(), "wt")
	wm := NewGitWorktreeManager(repo, base)
	ctx := context.Background()

	path, err := wm.Create(ctx, "task-1", "main")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if path != wm.Path("task-1") {
		t.Fatalf("Create path %q != Path() %q", path, wm.Path("task-1"))
	}
	if fi, err := os.Stat(path); err != nil || !fi.IsDir() {
		t.Fatalf("worktree dir missing after Create: %v", err)
	}
	// A file written in the worktree proves it is a real checkout.
	writeFile(t, filepath.Join(path, "scratch.txt"), "hi\n")

	// git worktree list should now mention the path.
	if list := worktreeList(t, repo); !strings.Contains(filepathToSlash(list), filepathToSlash(path)) {
		t.Fatalf("worktree list does not contain %q:\n%s", path, list)
	}

	if err := wm.Remove(ctx, path); err != nil {
		t.Fatalf("Remove: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("worktree dir still present after Remove: stat err=%v", err)
	}
	if list := worktreeList(t, repo); strings.Contains(filepathToSlash(list), filepathToSlash(path)) {
		t.Fatalf("worktree list still contains removed path %q:\n%s", path, list)
	}
}

func TestWorktreeCreateDefaultsToHEAD(t *testing.T) {
	requireGit(t)
	repo := initRepo(t)
	wm := NewGitWorktreeManager(repo, filepath.Join(t.TempDir(), "wt"))
	path, err := wm.Create(context.Background(), "task-head", "")
	if err != nil {
		t.Fatalf("Create with empty baseBranch: %v", err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("worktree not created: %v", err)
	}
}

func TestWorktreePathSanitizesEscape(t *testing.T) {
	wm := NewGitWorktreeManager("/repo", "/base")
	got := wm.Path("../../etc/passwd")
	// The path must stay inside /base — no parent traversal survives.
	if strings.Contains(filepathToSlash(got), "..") {
		t.Fatalf("sanitized path still contains parent ref: %q", got)
	}
	if !strings.HasPrefix(filepathToSlash(got), "/base/") {
		t.Fatalf("sanitized path escaped base dir: %q", got)
	}
	if filepath.Base(got) != "passwd" {
		t.Fatalf("expected final segment 'passwd', got %q", filepath.Base(got))
	}
}

func TestWorktreeCreateRejectsUnsafeID(t *testing.T) {
	requireGit(t)
	repo := initRepo(t)
	wm := NewGitWorktreeManager(repo, filepath.Join(t.TempDir(), "wt"))
	if _, err := wm.Create(context.Background(), "..", "main"); err == nil {
		t.Fatalf("expected error creating worktree for unsafe id '..'")
	}
}

func filepathToSlash(s string) string {
	return strings.ReplaceAll(s, "\\", "/")
}
