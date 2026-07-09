# Phase 1 — Remove index scaffolding from `init.js` + tests; delete the files ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `init` no longer creates the folder index files, its tests no longer
assert them, and the two `00-index.md` files are gone from this repo — suite
green.

## Tasks

- [x] In `src/init.js`, remove `installIndexes`, the `BACKLOG_INDEX` and
      `COMPLETE_INDEX` template constants, and the call from `init()`. Ensure the
      `backlog`/`complete` folders are still kept in git — drop the
      `FOLDERS_WITH_INDEX` exception so every empty spec folder (including those
      two) gets a `.gitkeep`.
- [x] `printReport` needed no change — it lists `report.created` dynamically and
      had no hardcoded index mention, so removing `installIndexes` was sufficient.
- [x] Update `test/init.test.js`: renamed the test to "scaffolds skills, rule,
      folders", dropped the two existence assertions, and asserted the index files
      are **not** created and `.gitkeep` keeps `backlog`/`complete`.
- [x] `git rm -f specs/backlog/00-index.md specs/complete/00-index.md`.
- [x] **Migration:** `init`/`update` now delete any retired `00-index.md` left by
      an earlier version (`removeRetiredFiles`, reported under "removed"); if that
      empties a bucket it drops a `.gitkeep` so the folder stays tracked. Added a
      test simulating an old install → re-run removes both + keeps the buckets.
- [x] Ran `npm test` (`node --test`) — 111/111 green.

## Notes

- Keep the release-tooling and env scaffolding paths untouched — this phase only
  removes the index-file scaffolding.
