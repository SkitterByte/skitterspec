---
linear_issue_id: "SKS-212"
---

# Phase 2 — Pathspec-limit every spec commit ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** no commit this workflow issues can reach a path it does not own —
including a path another session has already staged in the shared index.

## Tasks

- [x] Replace the staging block in
      `packages/common/assets/skills/spec-complete/SKILL.md` (currently
      `git add specs/ && git commit -m "chore(spec): complete <name>"`) with the
      `spec-env stage` call plus
      `git add -- <owned> && git commit -m "…" -- <owned>`.
- [x] Same for `packages/common/assets/skills/spec-cancel/SKILL.md`.
- [x] Update `packages/linear/assets/seams/spec-tracker-sync.md`: the paragraph
      justifying the broad `git add specs/` (it sweeps up the
      `specs/.core/linear-base/<ID>.base.json` snapshot) is now wrong — the
      snapshot is a declared `companionPaths` entry, so `stage` returns it by
      name. Say that instead.
- [x] Add `--` to the commands `planSpecCommit` emits in
      `packages/common/src/env/provision.js`, so the planned spec commit is
      pathspec-limited too.
- [x] Update the `spec-env stage` row in `docs/index.html`: its "who calls it"
      column reads `you` because phase 1 left nothing calling it. Once the
      skills do, name them.
- [x] State *why* in the skill prose, once: two sessions in the primary checkout
      share one `.git/index`, so `git add` alone does not bound a commit. Each
      skill carries a short version; the full account lives once in
      `.claude/rules/spec-planning.md`, which both point at.
- [x] Tests: a `planSpecCommit` unit test asserting the emitted commit command
      carries the `--` limiter and the same paths as the `add`.
- [x] An assets test asserting no lifecycle skill or seam stages a bare
      directory. It reads **fenced commands only**, not the whole file: both
      skills now name the anti-pattern in prose, and a blanket string ban would
      fail on the very sentence that keeps it from returning. Paired with a
      positive test feeding the detector the historical line, so it is visibly
      able to fire.
- [x] Run the project's typecheck and test commands — green before the phase is
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
