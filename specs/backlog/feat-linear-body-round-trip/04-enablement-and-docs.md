# Phase 4 — Opt-in config, deletion-divergence reporting, docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the body round-trip is opt-in, deletions are clearly reported (never
silently applied), and the docs/guide reflect the new capability.

## Tasks

- [ ] Config: expose the keyed body fields (`milestones`, `tasks`) as a documented
      opt-in in `packages/linear/src/config.js` — default stays the
      `bug-linear-live-sync` safe set (description + status/priority/labels); a
      workspace adds the keyed fields to turn body round-trip on.
- [ ] Deletion-divergence reporting: `/spec-status` (and pull/push summaries) list
      `removed` items on either side as an explicit "manual resolution" section
      (Decision 7) — asserted by a test.
- [ ] Docs: update `packages/linear/assets/core/SETUP.md`, `linear.config.md`, and
      the dist `README.md` — how to enable body round-trip, the inline-id / phase
      frontmatter conventions, and the report-only deletion behaviour. Remove the
      "planned extension" caveat once shipped.
- [ ] Rebuild the vendored dist (`node scripts/build-dist.js all`); full suite
      green. Update the `bug-linear-live-sync` "deferred gap" note to point here.

## Notes

This phase carries no new engine behaviour — it's the enablement + safety-surfacing
+ documentation that makes the feature usable and discoverable. Keep the default
off so existing users are unaffected until they opt in.
