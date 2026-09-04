---
linear_issue_id: "SKS-68"
---

# Phase 2 — Render, wire into release.js, backfill ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `scripts/release-notes.js <pkg> <version>` writes a correct section into
`RELEASES-<pkg>.md`, `release.js` runs it as part of a release, and the notes
already banked for 16.8.0 / 10.7.0 are backfilled.

## Tasks

- [ ] Render via the installed generator's exported pure functions —
      `parseReleaseNote`, `bucketFor`, `resolveArea`, `renderReleasesSection`,
      `upsertReleasesSection` — passing `scopeAreas` from
      `skittership.config.json`. Do not reimplement bucketing or the
      `Release-Note!:` / `Release-Area:` grammar.
- [ ] Write to `RELEASES-<pkg>.md`, creating it with the generator's
      `defaultReleasesHeader` when absent. Upsert by version, so re-running is
      idempotent rather than duplicating a section.
- [ ] Add a `[local]` step to `buildPlan` in `scripts/release.js` that runs the
      driver **before** the release commit, and extend that commit's `git add` to
      include the notes file, so both land together.
- [ ] Update the existing `release.test.js` step-order assertions — they pin the
      exact ordered command list, so a new step changes them deliberately.
- [ ] Assert the notes step runs before the commit and before publish: a release
      that publishes without its notes committed is the failure this ordering
      prevents.
- [ ] Backfill: generate the sections for `skitterspec@16.8.0` and
      `skitterspec-linear@10.7.0` from the eleven banked footers, and check the
      output reads as user-facing prose rather than commit subjects.
- [ ] Replace the "Historical — no longer maintained" banners in `RELEASES.md`
      and `CHANGELOG.md` with a pointer to the per-package files, so the old
      records stay as history without looking like the current one.
- [ ] Add a guard test that every `Release-Note:` footer in the release range
      appears in exactly the files its paths attribute to — the completeness
      check, since a silently dropped note is the failure mode this whole spec
      exists to end.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

The backfill is the real test of the rendering: eleven notes written over one day
by one author, several of them long. If the output reads badly, the fix is the
note grammar in `commit-messages.md`, not the renderer.

`CHANGELOG.md` is out of scope beyond its banner. The dev-facing changelog has
the same monorepo problem and deserves the same treatment, but one working
pipeline first.
