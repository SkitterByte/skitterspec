---
github_identifier: "#272"
github_url: "https://github.com/SkitterByte/skitterspec/issues/272"
---

# Bug: a worktree of a local install runs `update` as a team install

> **Type:** Bug
> **Name:** bug-local-scope-worktree
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/272
> **Author:** Reuben Greaves
> **Raised:** 2026-11-20
> **Area:** `packages/common/src/init.js` (`localSeedFiles`, `resolveScope`)
> **Docs:** reference

## Symptom

Reported while upgrading a local-mode install (`init --local`) of
`@skitterbyte/skitterspec-azure-boards` from 2.17.0 to 2.18.0, on Windows,
with the project in a subfolder (`FF.CSC.Solution/`) of the git repo:

- The primary checkout's `specs/.core/.skitterspec-manifest.json` has
  `"scope": "local"` and is kept out of git by `.git/info/exclude`.
- `spec-env nospec <name>`, `git worktree add`, `spec-env bootstrap <name>`,
  then `update` in the worktree.
- Expected: `local install (recorded in the manifest) — kept local`, the
  block in `CLAUDE.local.md`, the hooks in `settings.local.json`.
- Actual: team mode. The 128-line block was appended to the tracked
  `CLAUDE.md`, an untracked `.claude/settings.json` held the three hooks,
  13 unedited files were listed as `customized (kept)`, and the worktree's
  manifest was rewritten without `scope`.

## Root cause

The scope lives only in the manifest, which a local install keeps out of git.
`localSeedFiles` (`packages/common/src/init.js`), the list `spec-env bootstrap`
seeds into a worktree, named the managed paths and the two per-machine files
but not the manifest. The worktree therefore had no manifest, `readManifest`
answered its empty baseline (`scope: 'team'`, nothing baselined), and
`resolveScope` chose team. The empty baseline is also why every managed file
read as customized.

## Failing test (red)

`packages/common/test/init-local.test.js`:

- `update in a bootstrapped worktree of a local install stays local
  (symlink|copy)`: seed via `localSeedFiles`, `resync` in the worktree, and
  assert no `CLAUDE.md`, no `.claude/settings.json`, scope local, `kept
  local` reported, nothing customized, git sees nothing.
- `update in a worktree with no manifest stays local while the exclude block
  names it`: a subfolder project, seeded without the manifest (a worktree
  bootstrapped before the fix).
- `an update of a team install never reads it as local`: stays-silent.

Run: `node --test packages/common/test/init-local.test.js`. Red:
`AssertionError [ERR_ASSERTION]: no block in the tracked CLAUDE.md` in all
three local cases.

## Fix

- [x] `localSeedFiles` seeds the manifest (posix path), so bootstrap carries
      the scope and the hashes into each worktree
- [x] `resolveScope` reads local when the shared `.git/info/exclude` block
      names THIS project's prefixed manifest path, so a worktree bootstrapped
      before the fix is covered without re-bootstrapping
      (`excludeNamesManifest`; cannot-tell answers false)
- [x] Failing tests green; full suite green
- [x] `MIGRATION.md` (root and each distribution copy): revert the stray
      `CLAUDE.md` block and `.claude/settings.json` by hand, drop the
      scopeless manifest and re-bootstrap
- [x] `docs/reference.html` `init --local` row names the seeded manifest and
      the exclude fallback

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env bootstrap` seeds `specs/.core/.skitterspec-manifest.json` for a local install |
| CLI command | update | `update`/`init` read local scope from the `.git/info/exclude` block when the manifest does not record it |
| Docs | update | `MIGRATION.md`, `docs/reference.html` |

## Changelog

- 2026-11-20 — Bug reproduced; failing test added (red).
- 2026-11-20 — Fixed: bootstrap seeds the manifest, and `resolveScope` falls
  back to the exclude block; test green. The suggested warn-or-refuse before
  writing team files is subsumed: the exclude block is now read as the scope
  rather than as a reason to stop.
