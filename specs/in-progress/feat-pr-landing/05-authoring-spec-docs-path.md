---
github_issue_id: "#111"
---

# Phase 5 — authoring paths: `land.specDocs` trunk · branch ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a project whose branch protection forbids direct pushes can still
author specs: the spec document rides the feature branch and lands with the
work's PR.

## Tasks

- [x] `specDocs: "trunk"` (default): `/spec` Phase C2 behaves exactly as today —
      committing verdicts run `spec-env integrate` and the base gains the spec.
      No change; the stays-silent test re-provisions a branch-only spec under
      trunk and still gets the "not committed in the fork point" refusal.
- [x] `specDocs: "branch"`: C2's committing verdicts commit on the authoring
      branch and **skip integrate** (SKILL.md text); `specOnForkPoint` is
      exempt in this mode exactly as a hotfix is — the spec is *supposed* to be
      absent from the fork point — which is what lets `/spec-start` re-run `up`
      over the authoring worktree without a refusal. Plain `commit` keeps the
      branch and worktree (they are the document's only copy).
- [x] `/spec` SKILL.md + `spec-planning.md`: visibility trade documented (the
      tracker listing / `git branch` is the backlog in branch mode), plus the
      `/spec-cancel`-on-unstarted consequence (branch + worktree deleted, spec
      dies with them, no PR ever existed).
- [x] `spec-env resolve`: a branch-mode backlog spec resolves through its
      standing worktree (the fallback that already existed — keeping the
      worktree on plain `commit` is what keeps the spec resolvable).
- [x] Tests: up-attach not refused in branch mode, trunk same-state refusal
      (stays-silent), resolve of a branch-only spec via its worktree.
- [x] Run `pnpm test` — green (4299 pass) · dist build green.

## Notes

`branch` mode deliberately accepts the known cost this repo's rules warn about
(a spec on an unlanded branch is invisible on base): branch protection makes
the alternative impossible, and the tracker listing exists precisely to answer
discovery when buckets cannot. The future checkout model (tracker holds dormant
specs) supersedes this path cleanly if adopted — note kept in the overview
Changelog.
