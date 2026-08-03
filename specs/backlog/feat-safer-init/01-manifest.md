# Phase 1 — Install manifest + managed-state classifier ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every install/resync records what it wrote to a committed manifest, and
a classifier can tell `missing` / `pristine` / `customized` for any managed file —
proven by fixtures.

## Tasks

- [ ] Add `readManifest(dir)` / `writeManifest(dir, entries)` in `init.js` backed
      by `specs/.core/.skitterspec-manifest.json` (`{ version, files: { relPath:
      sha1 } }`); tolerate a missing/malformed file (→ empty).
- [ ] In `writeFile` (and the folder/CLAUDE paths as applicable), record the
      sha1 of the content written, keyed by repo-relative path, and flush the
      manifest at the end of an install/resync run.
- [ ] Add `managedState(dir, relPath, bundledContent)` → `missing` (absent) /
      `pristine` (on-disk sha1 === manifest sha1) / `customized` (differs) — the
      basis for resync/reset decisions.
- [ ] Pre-manifest migration (Open question): when no manifest exists but managed
      files do, classify them `customized` and seed the manifest from current
      bundled hashes so the first resync is non-destructive.
- [ ] Tests in `packages/common/test/init.test.js`: manifest written on init with
      correct hashes; `managedState` returns each of missing/pristine/customized;
      malformed manifest tolerated; migration path seeds without clobbering. Run
      the project's typecheck + test commands — green before done.

## Notes

The manifest lists only managed **files** (skills, rules, `.core` templates).
CLAUDE.md is user-owned and stays governed by its marker block, not a hash entry.
Keep the manifest committed (it's the shared baseline).
