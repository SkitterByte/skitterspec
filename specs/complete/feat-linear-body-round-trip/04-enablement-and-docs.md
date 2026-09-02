---
linear_issue_id: "SKS-16"
---

# Phase 4 — Opt-in config, deletion-divergence reporting, docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the body round-trip is opt-in, deletions are clearly reported (never
silently applied), and the docs/guide reflect the new capability.

## Tasks

- [x] Config: keyed body fields (`milestones`, `tasks`) are a documented opt-in
      (`sync.keyedFields`, empty by default — the `bug-linear-live-sync` safe set
      stays default); example gains `"keyedFields": {}`.
- [x] Deletion-divergence reporting: `/spec-status` lists `removed` keyed items as
      a "needs manual resolution" section; pull/push summaries already surface
      `keyedReported`/report-only. Asserted by the removal fixtures (compare-keyed,
      pull-milestones, tasks-writeback).
- [x] Docs: `SETUP.md`, `linear.config.md` (new "Body round-trip" section), and the
      dist `README.md` document enabling it, the inline-id / phase-frontmatter
      conventions, and report-only deletions. "Planned extension" caveat removed.
- [x] Rebuilt the vendored dist; full suite 282 green. Updated the
      `bug-linear-live-sync` deferred-gap note to point here.

## Notes

This phase carries no new engine behaviour — it's the enablement + safety-surfacing
+ documentation that makes the feature usable and discoverable. Keep the default
off so existing users are unaffected until they opt in.
