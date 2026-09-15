---
linear_issue_id: "SKS-264"
---

# Phase 3 — Commit hook: install + stays-silent tests ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a bare `git commit` in a spec worktree with an armed gate is blocked
by the harness itself, installed idempotently by `spec-init` — and provably
silent everywhere else.

## Tasks

- [x] Ship `assets/hooks/review-gate.js` (dependency-free node): reads the
      `PreToolUse` payload, hands the command line to
      `spec-env review gate --check --for-command`, and turns one exit status
      into a `deny` naming the page, `/spec-reviewed` and `review skip`. It
      decides nothing itself — the "is this a commit" judgement lives in
      `src/env/commitcmd.js`, where it is unit tested
- [x] `spec-init`: install/repair the `PreToolUse` hook entry in the project's
      `.claude/settings.json` alongside the existing managed assets, honouring
      the manifest's customized-file rules; idempotent re-run
- [x] Respect `review.required: false` — the hook defers entirely to
      `--check`, so the config is read in exactly one place
- [x] Name the blind spots in comments beside the checks (per
      `negative-checks.md`): engine not on PATH, registry absent, settings
      hand-edited
- [x] Stays-silent tests: commit on `main` while another spec owes a verdict,
      a commit in a different spec's worktree, a repo with no isolation, a
      missing engine, a crashing engine, an unreadable payload, a non-Bash
      tool, every non-commit command, and a cleared gate — none blocked; plus
      the one positive test that the armed case fires. `pnpm test` green
      (2465 passed)

## Notes

The hook never edits or wraps skittership's `/commit` — that skill runs
`git commit` like anything else, so the hook covers it from below and the
package boundary stays clean.

**The stays-silent tests earned their keep immediately.** The first working
hook denied a commit in the *primary checkout* whenever any spec's gate was
armed: the engine's bare resolution answers with the sole provisioned spec
wherever you stand, which is right for a person typing the verb and wrong for
this. Authoring a backlog spec from `main` — the thing `commit-trailers.md`
asks for — would have been blocked by unrelated work, with a message about a
phase the operator was not working on. The check now needs a positive signal:
the commit is running inside that spec's own worktree.
