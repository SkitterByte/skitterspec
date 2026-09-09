---
linear_issue_id: "SKS-100"
---

# Phase 3 — CLI and `/spec-start` wiring ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the whole path works end to end — `/spec` then `/spec-start` with no
manual commit in between — and the skill's gate section describes what the engine
actually does.

## Tasks

- [x] In `src/cli.js`, supply the new ctx facts to both planners: `dirtyPaths` from
      `git status --porcelain` (repo-relative, including untracked), and `specOnBase`
      from `git cat-file -e <base>:<specPath>/00-overview.md`.
- [x] Treat an unreadable git status as dirty-and-unclassifiable — refuse rather
      than commit. The existing precedent is `src/cli.js:1358`, where an unreadable
      tree is already treated as dirty.
- [x] Print the classification above the plan: which paths are being committed and
      why they qualify, so the commit is never a surprise.
- [x] Rewrite `/spec-start`'s gate section (`assets/skills/spec-start/SKILL.md` §1)
      to relay the engine's three outcomes. Keep **"never get past the gate
      yourself"** for foreign dirt — the rule is unchanged, it just no longer covers
      the spec's own files, which the engine now plans for you.
- [x] Correct the section's claim that a dirty tree is refused "with the same words
      whatever the cause" — after this change there are two causes with two answers,
      and the sentence would be a lie left in place.
- [x] Seed `spec.companionPaths` with the Linear snapshot pattern from the
      provider side, so the composed distribution works out of the box — check
      whether that belongs in the Linear package's own core assets or in
      `/spec-linear-setup`, and do whichever keeps the base tracker-free.
- [x] Extend the asset tests to assert the gate section still refuses foreign dirt
      and no longer claims a single uniform refusal.
- [x] Verify the real path by hand: author a throwaway spec with `/spec`, run
      `/spec-start` on it, and confirm no manual `/commit` was needed and the
      worktree contains the spec.
- [x] Run `node --test` and `node scripts/build-dist.js all` — green before the
      phase is done.

## Notes

**Two bugs found by running it, neither visible in review.** The hand-check task
in this phase earned its place twice over:

1. **`git status --porcelain` collapses untracked files into their topmost
   untracked directory.** A brand-new spec in an empty bucket is reported as
   `specs/backlog/`, not `specs/backlog/feat-x/` — an ancestor attributable to no
   single spec, so it classified as foreign and refused the exact tree the gate
   exists to accept.
2. **The shared git reader trims its output**, eating the leading space of
   porcelain's first line, so a fixed-offset parse returned `EADME.md` for
   `README.md` — silently mangling any path it reported.

Both are gone: the CLI now reads `git diff --name-only HEAD` plus
`git ls-files --others --exclude-standard`, which emit **bare paths, one per
line** — no status field to mis-slice and no directory collapsing. `add` vs
`update` is asked of `git ls-files` instead of being inferred from the shape of
status output.

**A design error, caught the same way.** The plan said to assert the spec is in
the *base branch*. A worktree forks from **HEAD**, and a hotfix deliberately
forks from a released tag that predates the spec describing the fix — so
checking against base would have refused **every hotfix**. The check is now
against the fork point and is skipped entirely when `spec.baseRef` is set.
`ctx.specOnBase` became `ctx.specOnFork` to stop the name implying the old,
wrong thing.

**Unreadable git is mode-dependent, from phase 2.** Worktree mode provisions
anyway (`worktree add` carries nothing); checkout mode still refuses (`switch -c`
carries work we cannot see). Both are tested.

**Provider seeding went into `/spec-linear-setup` (step 8b)**, not into the base
example — `specs/.core/linear-base/` is Linear's path, and the base engine stays
tracker-free.
