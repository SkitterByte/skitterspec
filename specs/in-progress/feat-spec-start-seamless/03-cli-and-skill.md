---
linear_issue_id: "SKS-100"
---

# Phase 3 — CLI and `/spec-start` wiring ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the whole path works end to end — `/spec` then `/spec-start` with no
manual commit in between — and the skill's gate section describes what the engine
actually does.

## Tasks

- [ ] In `src/cli.js`, supply the new ctx facts to both planners: `dirtyPaths` from
      `git status --porcelain` (repo-relative, including untracked), and `specOnBase`
      from `git cat-file -e <base>:<specPath>/00-overview.md`.
- [ ] Treat an unreadable git status as dirty-and-unclassifiable — refuse rather
      than commit. The existing precedent is `src/cli.js:1358`, where an unreadable
      tree is already treated as dirty.
- [ ] Print the classification above the plan: which paths are being committed and
      why they qualify, so the commit is never a surprise.
- [ ] Rewrite `/spec-start`'s gate section (`assets/skills/spec-start/SKILL.md` §1)
      to relay the engine's three outcomes. Keep **"never get past the gate
      yourself"** for foreign dirt — the rule is unchanged, it just no longer covers
      the spec's own files, which the engine now plans for you.
- [ ] Correct the section's claim that a dirty tree is refused "with the same words
      whatever the cause" — after this change there are two causes with two answers,
      and the sentence would be a lie left in place.
- [ ] Seed `spec.companionPaths` with the Linear snapshot pattern from the
      provider side, so the composed distribution works out of the box — check
      whether that belongs in the Linear package's own core assets or in
      `/spec-linear-setup`, and do whichever keeps the base tracker-free.
- [ ] Extend the asset tests to assert the gate section still refuses foreign dirt
      and no longer claims a single uniform refusal.
- [ ] Verify the real path by hand: author a throwaway spec with `/spec`, run
      `/spec-start` on it, and confirm no manual `/commit` was needed and the
      worktree contains the spec.
- [ ] Run `node --test` and `node scripts/build-dist.js all` — green before the
      phase is done.
