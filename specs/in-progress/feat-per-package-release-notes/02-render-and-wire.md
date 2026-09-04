---
linear_issue_id: "SKS-68"
---

# Phase 2 — Render, wire into release.js, backfill ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `scripts/release-notes.js <pkg> <version>` writes a correct section into
`RELEASES-<pkg>.md`, `release.js` runs it as part of a release, and the notes
already banked for 16.8.0 / 10.7.0 are backfilled.

## Tasks

- [x] Render via the installed generator's pure functions — `parseCommit`,
      `parseReleaseNote`, `renderReleasesSection`, `upsertReleasesSection`,
      `defaultReleasesHeader` — with `scopeAreas` from `skittership.config.json`.
      No bucketing or footer grammar reimplemented.
- [x] Write to `RELEASES-<pkg>.md`, creating it with the generator's header when
      absent, upserting by version so a re-run is idempotent.
- [x] Add a `[local]` notes step to `buildPlan` **before** the stage, and extend
      the stage to include the notes file so both land in the release commit.
- [x] Update the pinned step-order assertion in `release.test.js` — the new step
      changes it deliberately.
- [x] Assert the ordering explicitly: notes → stage → commit → publish. Plus a
      test that an equal-version release (which skips the bump and commit) emits
      **no** notes step, since there is nothing to attach them to.
- [x] Backfill `skitterspec@16.8.0` (10 notes) and `skitterspec-linear@10.7.0`
      (15 notes) and read the output — it reads as user-facing prose, grouped by
      area, with the `Release-Note!:` highlight grammar intact.
- [x] Replace the "Historical" banners in `RELEASES.md` and `CHANGELOG.md` with
      pointers to the per-package files.
- [x] Add the completeness guard: attributed + orphaned must account for **every**
      footer-carrying commit, with no overlap and nothing in between.
- [x] **Report orphans** on every run, never drop them silently.
- [x] Run `pnpm test` — **1302 green** (23 new across both phases).

### Also done

- [x] Correct the `CLAUDE.md` release-tooling section, which the installer wrote
      describing an `npm version` hook and `changelog`/`releases` scripts this
      repo deliberately does not have. The note sits **outside** the
      `skittership:start/end` markers, so the managed block stays pristine and a
      later `skittership update` will not report it customized.

## Notes

### Three bugs the backfill caught

Each was invisible to the unit tests and only showed up against real history:

1. **`parseCommit` takes one NUL-delimited string**, not `(hash, subject, body)`.
   Passing three arguments returned `null` for every commit, so the driver
   cheerfully reported *"no user-facing change"* on a range with ten notes in it —
   a wrong answer that looked like a valid one.
2. **`orphansFor` guessed the package**, using `PACKAGES[0]` for the tag range
   whatever it was asked about. Queried for `skitterspec-linear@10.7.0` it
   resolved the range from the highest *skitterspec* tag below 10.7.0 — years of
   history — and reported 15 orphans instead of 3. It now takes the package.
3. **The header read "skitterspec (skitterspec)"**, from interpolating the
   configured product name alongside the package. Each file names its own package;
   the configured name is not used.

### Known limitation — a note can be broader than its commit

`fix(sync): ref can name the spec` appears in **both** files, because it touched
`packages/common/assets/skills/` as well as `packages/linear/`. Its note text
describes the Linear-only half. Attribution is right — the commit genuinely ships
in both — but a reader of the base notes sees a sentence about `spec-sync`.

The fix is to split such a commit, not to weaken attribution: path attribution
being occasionally too generous is far better than scope-guessing, which is a
human label and already drifts from the tree.

The backfill is the real test of the rendering: eleven notes written over one day
by one author, several of them long. If the output reads badly, the fix is the
note grammar in `commit-messages.md`, not the renderer.

`CHANGELOG.md` is out of scope beyond its banner. The dev-facing changelog has
the same monorepo problem and deserves the same treatment, but one working
pipeline first.
