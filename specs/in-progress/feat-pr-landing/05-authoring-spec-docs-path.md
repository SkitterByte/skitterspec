---
github_issue_id: "#111"
---

# Phase 5 — authoring paths: `land.specDocs` trunk · branch ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a project whose branch protection forbids direct pushes can still
author specs: the spec document rides the feature branch and lands with the
work's PR.

## Tasks

- [ ] `specDocs: "trunk"` (default): `/spec` Phase C2 behaves exactly as today —
      committing verdicts run `spec-env integrate` and the base gains the spec.
      No change, covered by a stays-silent test.
- [ ] `specDocs: "branch"`: C2's committing verdicts commit on the authoring
      branch and **skip integrate**; `commit-start` renames nothing and
      `/spec-start` re-runs `up` over the same worktree (the branch already
      exists — `provision.js`'s `specOnForkPoint` check is skipped in this
      path, since the spec is on the branch rather than in base's HEAD by
      design). Plain `commit` keeps the branch and worktree (there is no base
      copy to park), reported honestly: the spec is findable via the tracker
      listing, not via `ls specs/backlog/` on base.
- [ ] `/spec` SKILL.md + `spec-planning.md`: document the visibility trade
      (`branch` mode backlog discovery = the tracker listing / `git branch`),
      and that `/spec-cancel` on an unstarted branch-mode spec deletes branch +
      worktree with the PR never having existed.
- [ ] `spec-env resolve` / `spec-list`: a branch-mode backlog spec (branch
      exists, bucket says backlog, never started) resolves and lists correctly.
- [ ] Unit tests: C2 plan per `specDocs` value, `specOnForkPoint` skip only in
      branch mode, resolve/list fixtures — plus the trunk stays-silent test.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

`branch` mode deliberately accepts the known cost this repo's rules warn about
(a spec on an unlanded branch is invisible on base): branch protection makes
the alternative impossible, and the tracker listing exists precisely to answer
discovery when buckets cannot. The future checkout model (tracker holds dormant
specs) supersedes this path cleanly if adopted — note kept in the overview
Changelog.
