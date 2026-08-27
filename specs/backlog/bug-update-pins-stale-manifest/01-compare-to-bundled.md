# Phase 1 — Compare against the bundled asset, and heal the manifest ⬜

> **Status:** Not started

**Goal:** a managed file whose content matches the package is `pristine` however
stale the manifest is, and the run repairs the manifest entry so it stays
unpinned.

## Tasks

- [ ] RED — add to `packages/common/test/init.test.js`: install into a temp dir,
      corrupt the manifest hash for one core file **without touching the file**,
      run `resync`, and assert the file is not reported `customized`.
- [ ] RED — the reporter's exact shape: damage a core file, run `resync` (kept as
      customized, correctly), restore it byte-for-byte from the package asset,
      run `resync` again, and assert it is **not** pinned.
- [ ] Change `managedState(dir, relPath, manifest)` to take the target
      (`{ relPath, abs, bundled }`): content equal to `bundled` → `pristine`;
      else hash equal to the manifest entry → `pristine`; else `customized`.
- [ ] Update both callers — `resyncManagedFile` (`init.js:408`) and
      `pruneRetiredManaged` (`init.js:275`). Resolve the Open question there:
      a retired file has no bundled asset, so that call site keeps
      manifest-only comparison.
- [ ] Assert the manifest is **healed**, not just the classification: after the
      restore-then-resync run, read `.skitterspec-manifest.json` back and check
      the entry equals `sha1(bundled)`.
- [ ] Assert a genuinely edited file is still `customized (kept)` — the control
      that proves this closed a false positive and nothing more.
- [ ] Report a healed entry in `printReport` (Decision 5) — a short
      `manifest repaired` line naming the files.
- [ ] GREEN — `node --test packages/common` green; full suite green. Commit with
      a `Release-Note:` — users get a tool that recovers from a restore instead
      of staying stuck.
