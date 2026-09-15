---
linear_issue_id: "SKS-264"
---

# Phase 3 — Commit hook: install + stays-silent tests ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a bare `git commit` in a spec worktree with an armed gate is blocked
by the harness itself, installed idempotently by `spec-init` — and provably
silent everywhere else.

## Tasks

- [ ] Ship a hook script with the assets (dependency-free node, like the
      engine) that detects a `git commit` Bash invocation, resolves whether
      the CWD is a spec worktree, runs `spec-env review gate --check` there,
      and blocks with a message naming the page, `/spec-reviewed`, and
      `review skip` — every other command, and every cannot-tell, passes
      through untouched
- [ ] `spec-init`: install/repair the `PreToolUse` hook entry in the project's
      `.claude/settings.json` alongside the existing managed assets, honouring
      the manifest's customized-file rules; idempotent re-run
- [ ] Respect `review.required: false` — the hook defers entirely to
      `--check`, so the config is read in exactly one place
- [ ] Name the blind spots in comments beside the checks (per
      `negative-checks.md`): engine not on PATH, registry absent, settings
      hand-edited
- [ ] Stays-silent tests: commit on `main`, commit in a non-spec repo, commit
      with the engine missing, commit with gate disarmed, non-commit git
      commands — none blocked; plus the one positive test that the armed case
      fires — `pnpm test` green

## Notes

The hook never edits or wraps skittership's `/commit` — that skill runs
`git commit` like anything else, so the hook covers it from below and the
package boundary stays clean.
