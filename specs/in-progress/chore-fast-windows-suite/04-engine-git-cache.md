---
github_issue_id: "#260"
---

# Phase 4 — Cache the engine's repeated git reads ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** one skitterspec command asks git each read-only question once.
Proven by a spawn census before and after, and by tests that a write in the
same process is never answered from a stale read.

## Tasks

- [ ] Find the shared git readers (`gitReader` and its siblings in
      `packages/common/src`) and list which calls are read-only and repeated
      within one command. The census gives the counts.
- [ ] Memoize read-only calls (`rev-parse`, `symbolic-ref`, `worktree list`,
      `show-ref`, `config --get` …) per process, keyed by cwd and argv. Any
      command that writes (`commit`, `checkout`, `switch`, `worktree add`,
      `branch`, `config` without `--get` …) clears the memo for that repo.
- [ ] Re-run the census and record the spawns saved, then re-measure on the VM.
- [ ] Tests: repeated reads spawn once; a write in between is followed by a
      fresh read; separate repos never share answers. Stays-silent case: a
      read that failed (null) is not cached as a fact. Run `pnpm test`, green.
