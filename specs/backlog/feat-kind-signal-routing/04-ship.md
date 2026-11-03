---
github_issue_id: "#104"
---

# Phase 4 — Ship: docs, build, full suite ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the routing is documented, the supersets carry it, and the whole
repo is green.

## Tasks

- [ ] Update `docs/reference.html`: describe the signal watch where the entry
      skills / kind proposal are covered (one tight paragraph + the matrix),
      bump its `verified:` to the commit that carries this change. Check
      whether `docs/index.html`'s lifecycle overview needs a line; bump its
      `verified:` only if edited.
- [ ] Run `npm run build` so the superset packages regenerate with the updated
      base skills; commit the regenerated superset assets with the source.
- [ ] Run `node scripts/docs-freshness.js impact` and resolve what it lists.
- [ ] Run the full root suite — green before the phase is done.

## Notes

No MIGRATION.md section: no config keys, no behaviour a consumer must opt into —
consumers pick the new skill text up with `skitterspec update`. The commit that
lands the behaviour carries a `Release-Note:` (user-visible: the grill now
notices the work is a different kind and offers the right door).
