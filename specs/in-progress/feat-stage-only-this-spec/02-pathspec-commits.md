---
linear_issue_id: "SKS-212"
---

# Phase 2 — Pathspec-limit every spec commit ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** no commit this workflow issues can reach a path it does not own —
including a path another session has already staged in the shared index.

## Tasks

- [ ] Replace the staging block in
      `packages/common/assets/skills/spec-complete/SKILL.md` (currently
      `git add specs/ && git commit -m "chore(spec): complete <name>"`) with the
      `spec-env stage` call plus
      `git add -- <owned> && git commit -m "…" -- <owned>`.
- [ ] Same for `packages/common/assets/skills/spec-cancel/SKILL.md`.
- [ ] Update `packages/linear/assets/seams/spec-tracker-sync.md`: the paragraph
      justifying the broad `git add specs/` (it sweeps up the
      `specs/.core/linear-base/<ID>.base.json` snapshot) is now wrong — the
      snapshot is a declared `companionPaths` entry, so `stage` returns it by
      name. Say that instead.
- [ ] Add `--` to the commands `planSpecCommit` emits in
      `packages/common/src/env/provision.js`, so the planned spec commit is
      pathspec-limited too.
- [ ] State *why* in the skill prose, once: two sessions in the primary checkout
      share one `.git/index`, so `git add` alone does not bound a commit.
- [ ] Tests: a `planSpecCommit` unit test asserting the emitted commit command
      carries the `--` limiter and the same paths as the `add`.
- [ ] An assets test asserting no lifecycle skill or seam stages a bare
      directory — grep the asset trees for `git add specs/` and
      `git add -A`/`git add .` and fail on a hit. This is the check that stops
      the instruction coming back.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

`git commit -- <path>` fails on a path git has never seen, which is why the
`git add --` stays: the add makes a new spec folder known, the commit's pathspec
bounds what goes in. Verified against a scratch repo with a concurrently staged
file — the foreign entry stayed staged and out of the commit.

These skills run inside the spec's own worktree, where `specs/` is usually only
that spec's. The fix still belongs here: a backlog spec authored inside a
worktree (which happens, and which `/spec` warns about rather than refusing) puts
a second spec's folder in exactly that tree.

Asset tests exist for skill prose (`packages/common/test/assets-*.test.js`) and
descriptions carry a size budget (`scripts/skill-budget.test.js`) — bodies do
not, but keep the added prose to the one sentence the decision needs.
