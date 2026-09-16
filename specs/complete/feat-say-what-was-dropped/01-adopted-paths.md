---
linear_issue_id: "SKS-278"
---

# Phase 1 — An adopted path is not your edit ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `update` and `update --check` distinguish a path upstream has newly
adopted from a file the user edited, keeping both and mislabelling neither —
proven by a positive test and three stays-silent ones.

## Tasks

- [x] Carry the positive signal on `readManifest` as `baselined` — true only
      when the manifest parsed and holds at least one entry. Its own return
      value cannot otherwise answer this: it collapses missing and malformed
      into the same empty baseline. (Planned as a separate `manifestPresent(dir)`
      — see the Changelog for why it moved.)
- [x] Extend `managedState` with `adopted`: the file exists, differs from
      `bundled`, has no manifest entry, **and** the manifest is `baselined`. Every
      other combination keeps its current answer — a cannot-tell stays
      `customized`, which keeps the file.
- [x] Write the blind-spot comment beside it, naming both: a malformed manifest
      must never read as present, and the signal is one-shot because
      `flushManifest`'s migration seed gives the path an entry on the next run.
- [x] Add a `report.adopted` bucket carrying `{ relPath, added, removed, hunks }`
      — the same shape `report.customized` uses, so `--diff` needs no new branch.
      Reset it in `resetReport`.
- [x] Handle `adopted` in `resyncManagedFile`: identical write behaviour to
      `customized` (keep unless `force`), recorded in the new bucket.
- [x] Add the `printReport` line — `adopted upstream (kept — ours was never
      installed)` — and include the bucket in the `--diff` output and in the
      "re-run with --diff" hint.
- [x] Add the `checkSync` row: `adopted upstream — yours kept, theirs not
      installed (--force takes theirs)`.
- [x] Write the MIGRATION.md warning into the existing
      ``## `@skitterbyte/skitterspec` v20 → v21`` section: `.cjs` was the obvious
      workaround for v20's ESM crash, so a project that wrote its own
      `.claude/hooks/review-gate.cjs` keeps that shim, never gets the real hook,
      and loses `review-gate.js` from under it — and because the shim fails open,
      the gate is silently absent. Say how to check, and that `--force` or
      deleting the shim fixes it.
- [x] Add `packages/common/test/init-adopted-path.test.js`:
      **positive** — manifest present with entries, a managed path absent from
      it, a differing file on disk → `adopted`, file untouched, reported under
      the new label in both `update` and `--check`; `--force` overwrites it.
- [x] Add the stays-silent tests to the same file (negative-checks rule 3):
      no manifest at all → `customized`, never `adopted`; a manifest that exists
      but is malformed JSON → `customized`; a genuine user edit to a path the
      manifest *does* carry → `customized`. All three keep the file.
- [x] Run `pnpm test` from the repo root — green before the phase is done.

## Notes

`packages/skitterspec/src/` and `packages/skitterspec-linear/src/` are gitignored
build output composed by `scripts/build-dist.js`. Edit `packages/common/src/`
only.

`--force` already writes through `customized`; `adopted` reuses that path rather
than adding a second one, so there is no new way to overwrite a file.
