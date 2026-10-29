---
github_issue_id: "#68"
---

# Phase 5 — Docs and dist ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the docs describe the boundary as built, and the dist packages
match the source.

## Tasks

- [ ] Delete `packages/linear/assets/core/ci-stages.md`, and `specs/.core/ci-stages.md`
      via `skitterspec update`
- [ ] Rewrite the release/CI sections of each provider's `*.config.md`,
      `SETUP.md`, `spec-sync` and setup skills, and `docs/*.html`: the boundary
      in one paragraph plus a `released --json` → tracker CLI example
- [ ] Update `spec-planning.md`'s ticketing section: tells, doesn't track
- [ ] Update `RELEASING.md` for the new mirror step
- [ ] Rebuild the `skitterspec-*` dist packages (`scripts/build-dist.js`)
- [ ] Note the major bump and the removed verbs in each provider's release notes
- [ ] `/spec-cancel feat-tracker-releases` — superseded by this spec
- [ ] Run typecheck + tests — green
