# Phase 1 — Install manifest + managed-state classifier ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** every install/resync records what it wrote to a committed manifest, and
a classifier can tell `missing` / `pristine` / `customized` for any managed file —
proven by fixtures.

## Tasks

- [x] `readManifest(dir)` / `writeManifest(dir, files)` backed by
      `specs/.core/.skitterspec-manifest.json` (`{ version, files: { relPath:
      sha1 } }`); tolerant of a missing/malformed file (→ empty baseline).
- [x] `writeFile` records the sha1 of content written into `writtenHashes`;
      `flushManifest(dir)` (called at the end of `init`) merges prior + written,
      seeds pre-existing files from their bundled hash, prunes gone files.
- [x] `managedState(dir, relPath, manifest)` → `missing` / `pristine` (on-disk
      sha1 === recorded) / `customized` (differs or unknown). `managedTargets(dir)`
      enumerates the managed set for Phase 2.
- [x] Pre-manifest migration: a repo with managed files but no manifest re-seeds
      from bundled hashes on the next run — an edited file classifies `customized`
      and is kept.
- [x] Tests in `init.test.js` (4): manifest hashes match installed content;
      `managedState` returns missing/pristine/customized; malformed manifest
      tolerated; migration re-seeds without clobbering a user edit. Suite 287 green.

## Notes

The manifest lists only managed **files** (skills, rules, `.core` templates).
CLAUDE.md is user-owned and stays governed by its marker block, not a hash entry.
Keep the manifest committed (it's the shared baseline).
