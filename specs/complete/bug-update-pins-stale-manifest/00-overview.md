# Bug: a stale manifest hash pins a managed file out of updates forever

> **Type:** Bug
> **Name:** bug-update-pins-stale-manifest (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** Complete (2026-08-27)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-27
> **Area:** packages/common/src/init.js
> **Stack:** worktree

## Symptom

`update` classifies a managed file as `customized (kept)` by comparing it against
its recorded hash in `specs/.core/.skitterspec-manifest.json`. It never compares
it against the **current package asset**. Once a hash goes stale, that file can
never receive an upstream change again — it is silently pinned, and the output
gives no hint that it is happening.

Reported from the field (skitterspec-linear 9.2.0). The worst version of it:
`specs/.core/env.config.md` and `linear.config.md` had been damaged by
skitterspec's **own** earlier `spec-sanitise` hyphen-join bug
(`**per- spec escalation**`). That damage changed their hashes, so `update`
classified them as user-customized — and the files were locked out of receiving
the very fix that would have repaired them. `linear.config.md` was still
documenting the retired project/milestone model two majors later.

Reproduced by the reporter after restoring both files byte-for-byte from the
package:

```
diff specs/.core/env.config.md node_modules/.../assets/core/env.config.md   # identical
sha1(file) = 7eb79b9d…   manifest says 38f82a2b…                            # still "customized"
```

The cause that started it is already fixed — `cli-sanitise.js` skips `.core`
since `ec2fc8c` — but nothing repairs a manifest that has already gone stale, so
every project that ran the old sanitise stays pinned.

## Root cause

`managedState` (`init.js:137`) takes only `(dir, relPath, manifest)` and returns
`pristine` **only** when the on-disk hash equals the recorded hash; everything
else is `customized`. The bundled asset is right there at the call site —
`managedTargets` already carries `bundled` on each target
(`init.js:395-399`), and `resyncManagedFile` destructures it — but the
classifier never receives it.

Anything that changes a managed file's content without going through `writeFile`
therefore pins it permanently: an out-of-band edit, a corrupting tool, a
partially-applied restore, or a manifest lost and re-seeded at the wrong version.

## Decisions

1. **A file matching the bundled asset is not customized.** Whatever the
   manifest says, compare against the current package asset *before* falling
   back to the manifest hash. The reporter's suggested fix, and the right one.
2. **The fix must also repair the manifest**, not merely re-classify. Once the
   file reads `pristine`, `resyncManagedFile`'s pristine branch records
   `sha1(bundled)` into `writtenHashes`, so `flushManifest` heals the entry and
   the file is unpinned for good. Verify this end-to-end, not by inspection —
   it is the whole point of the fix.
3. **Self-healing, not force.** `--force` already exists and clobbers; it is the
   wrong instrument, because it also discards genuine user edits. This makes the
   tool correct by default after any content restore.
4. **No change to what `customized` means when the file genuinely differs.** A
   real user edit is still kept and reported. This closes a false positive, and
   only that.
5. **The report tells the user when it healed.** A pinned file that silently
   starts updating again is the same class of invisible behaviour as the bug.
   Listing it under `unchanged` is not enough — say the manifest was repaired.
   (The wider "say what you skipped" gap is `feat-upgrade-and-update-safety`
   Phase 1; this is only the healed-entry line.)

## Solution overview

Give `managedState` the target rather than the relative path, so it can read
`bundled`: on-disk content equal to `bundled` → `pristine` (healed); else equal to
the manifest hash → `pristine`; else `customized`. Everything downstream is
unchanged — the existing pristine path already re-records the hash.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | fix | `update` no longer pins a file whose content matches the package |
| Engine | update | `managedState(dir, target, manifest)` — takes the target, reads `bundled` |
| Engine | update | manifest entry self-heals on the next run after a restore |
| CLI output | update | a healed entry is named in the report |
| Callers | update | `resyncManagedFile` and `pruneRetiredManaged` pass the target |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Compare against the bundled asset, and heal the manifest | ✅ | [01-compare-to-bundled.md](01-compare-to-bundled.md) |

## Open questions

- [x] **Resolved (Phase 1).** `pruneRetiredManaged` keeps manifest-only
      comparison: `bundled` is an *optional* fourth argument, and that call site
      passes none — there is no asset to compare a retired file against. Pinned
      by the existing retired-file tests, which pass unchanged.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-27 | Ready | backlog | Reuben Greaves |
| 2026-08-27 | In Progress | in-progress | Reuben Greaves |
| 2026-08-27 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-08-27 — Captured from the skitterspec-linear 9.2.0 field report; root
  cause confirmed at `init.js:137` (the classifier never sees `bundled`, which
  the call site already holds).
- 2026-08-27 — Filed as **Ready** in `backlog/` rather than the usual `/spec-bug`
  `In Progress`: captured as a batch triage with nothing implemented.
- 2026-08-27 — Noted that the trigger is already fixed (`ec2fc8c` makes
  `spec-sanitise` skip `.core`), which is why this is scoped to healing existing
  damage rather than preventing new damage.
- 2026-08-27 — Phase 1: `managedState` gained an **optional fourth argument**
  (`bundled`) rather than swapping `relPath` for the whole target, as the
  Solution overview proposed. `pruneRetiredManaged` classifies a file the package
  no longer ships, so it has no asset to pass; an optional argument states that
  honestly and left its call site and the existing tests untouched. Resolves the
  Open question.
- 2026-08-27 — Phase 1: the first version of the restore test was wrong and
  passed for the wrong reason — damaging a file does **not** strand the manifest,
  because `resync` keeps the recorded baseline when it classifies something as
  customized. The trap needs a *version gap*: the manifest holding an older
  release's hash while the file on disk matches the current one. The test now
  models that, which is what the field report actually described.
- 2026-08-27 — Completed; the single phase is done, 534 tests green. Nothing
  deferred. The Open question resolved inside Phase 1 rather than changing scope.
