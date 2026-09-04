---
linear_issue_id: "SKS-54"
---

# Phase 1 — Engine: remote ref, plan, config ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the planner can plan a remote-branch delete, safely and only when it
should — proven without touching a network.

## Tasks

- [x] `worktreeGitState()` returns `remoteBranch: string | null` — the
      remote-tracking ref when this clone can see one. Upstream first
      (`rev-parse --abbrev-ref --symbolic-full-name @{u}`, then verify the ref
      exists), falling back to checking each configured remote for
      `refs/remotes/<remote>/<branch>`. No hardcoded `origin`
- [x] Name the blind spots beside it: a stale ref plans a no-op delete that
      fails loudly; a branch pushed from another machine is missed, which is the
      safe direction; `git ls-remote` deliberately rejected
- [x] `planDown()` returns `remoteCommands: string[]`, populated only when
      **all** of: `spec.branch` set, `landed`, `remoteBranch` non-null, policy
      not `"never"` — and never inside `commands` unless policy is `"always"`
- [x] Derive the remote by stripping the exact `/<branch>` suffix, so a slashed
      branch name splits correctly; plan nothing if the ref doesn't match
- [x] `blocked()` returns an empty `remoteCommands` so the shape is uniform
- [x] Config: `teardown.deleteRemoteBranch` defaulting to `"prompt"`, with an
      unrecognised value falling back to `"prompt"` rather than a stronger policy
- [x] Tests — planner: outside-`commands`, unlanded-under-`--force`,
      tag-landed hotfix, no-branch, the three policies, absent block, non-origin
      remote, slashed branch, mismatched ref, blocked plan
- [x] **Stays-silent test:** `landed: true` with `remoteBranch: null` plans no
      remote command, emits no warning, and leaves `commands` byte-identical
- [x] Tests — config: default, the three policies, and the typo fallback
- [x] Full suite green

## Notes

`landed` is read three times now (unpushed guard, `-D` vs `-d`, remote delete) —
all asking "are these commits recoverable?". Kept as the single `landed` const so
they cannot drift apart.
