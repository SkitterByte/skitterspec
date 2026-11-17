---
github_issue_id: "#219"
---

# Phase 3 — Skill, seams and docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-complete` in PR mode uses the hold in run 1 and the send in
run 2 for the `branch` lane, and the shipped text says why.

## Tasks

- [ ] `spec-tracker-sync.md` × 4: replace "this push belongs to run 2" with
      the following. Branch lane: run 1 pushes with `--hold-state` before the
      move commit, and run 2 pushes with `--send-held`. Trunk lane: unchanged.
      Extend "Why it sits here" with one paragraph on why the hold keeps base
      clean.
- [ ] `packages/common/assets/skills/spec-complete/SKILL.md` §6-pr: run 1 step 4
      and run 2 name the hold and the send. Run 2's report names a leftover
      snapshot when the engine says it fell back.
- [ ] Regenerate the composed `packages/skitterspec-*` distributions with the
      repo's build script, rather than editing them by hand.
- [ ] Docs: the apply rows in `github`, `azure-boards`, `linear` and `jira` gain
      the two flags. Bump each page's `verified:`.
- [ ] Run `pnpm -r test` (incl. skill-text and docs-freshness tests), all green.
