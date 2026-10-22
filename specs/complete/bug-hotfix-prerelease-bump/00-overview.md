---
linear_identifier: "SKS-416"
linear_url: "https://linear.app/skitterbyte/issue/SKS-416/bug-hotfix-land-re-hotfixes-a-hotfix-base-onto-the-mainline"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: hotfix land re-hotfixes a hotfix base onto the mainline

> **Type:** Bug
> **Name:** bug-hotfix-prerelease-bump (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-10-22)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-22
> **Area:** packages/common/src/env/hotfix.js, packages/common/assets/core/env.config.md

## Symptom

Found from `~/code/ereqs` while landing `hotfix-vendor-node-runtime`, whose base
is `v36.2.3-hotfix.4`. In that repo prod runs a `v36.2.3-hotfix.N` line, while
test and demo releases have already used `v36.2.4`.

```
spec-env hotfix land: blocked — tag v36.2.4 already exists — bump the base version or delete the stale tag.
```

Both remedies are wrong:

- "Bump the base version" means forking from a tag prod isn't running.
- "Delete the stale tag" means deleting a released tag.

Where `v36.2.4` doesn't exist yet, it's worse. The run silently mints a
mainline-looking tag for a prod-only hotfix, taking a number the mainline owns.

The ereqs workaround was done by hand: `git cherry-pick -x` onto `main`, then
`pnpm version 36.2.3-hotfix.5`.

## Root cause

`nextTag` (`packages/common/src/env/hotfix.js:117`) routes the default
`hotfix.bump: "patch"` to `bumpPatch` (`:31`). `bumpPatch` drops any suffix and
bumps the patch, so `v36.2.3-hotfix.4 → v36.2.4`. A `-hotfix.N` base is a
positive signal that the line is already a hotfix line, and only
`"hotfix-suffix"` read it (`nextHotfixTag`, `:96`). That strategy shipped in
`skitterspec-linear@18.1.0`, but ereqs is on 18.0.0 and runs the default.

The collision refusal (`:209`, and `:251` for targets) suggests the two remedies
above, when the safe one is the suffix line.

## Failing test (red)

`packages/common/test/env-hotfix.test.js`. Run it with
`node --test test/env-hotfix.test.js` from `packages/common`.

- **`patch: a hotfix base continues its line; a plain or rc base bumps the patch`.** Asserts `v36.2.3-hotfix.4 → v36.2.3-hotfix.5`, `v36.2.3 → v36.2.4` and `v36.2.3-rc1 → v36.2.4`.
- **`patch: a hotfix base is not blocked by the mainline next patch`.**
- **`patch: a hotfix target continues its own line, a plain target bumps`.** This is the `--also` case.
- **`a patch collision names the free hotfix tag and never suggests a delete`.** It refuses, plans no commands, and names `v33.16.4-hotfix.1`.

Red: `ℹ fail 4` — `actual: 'v36.2.4', expected: 'v36.2.3-hotfix.5'`.

## Fix

- [x] `nextTag`: under `patch`, a base that parses as `-hotfix.N` goes to
      `nextHotfixTag`. A plain or other pre-release base keeps `bumpPatch`.
- [x] Both collision refusals name the free tag
      (`hotfix.bump "hotfix-suffix"` → `<root>-hotfix.<n>`). They never suggest
      deleting a tag or forking from another base.
- [x] Document the hotfix-base rule beside `hotfix.bump` in `env.config.md`.
- [x] Failing tests pass (GREEN). Run the common suite and confirm no
      regressions.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Business rule | update | `hotfix.bump: "patch"` on a `-hotfix.N` base → next `-hotfix.N+1` |
| CLI command | update | `spec-env hotfix land` collision refusal names the free hotfix tag |
| Config key | update | `hotfix.bump` doc (env.config.md) |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-22 | In Progress | in-progress | Reuben Greaves |
| 2026-10-22 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-10-22 — Bug reproduced from the ereqs handoff; failing tests added (red).
- 2026-10-22 — Scoped out the handoff's optional criterion 5 (skip the main
  cherry-pick when the fix is already on main). It's a separate feature, not
  this bug.
- 2026-10-22 — Fixed: `patch` continues a `-hotfix.N` base's line, and a
  collision names the free hotfix tag; 3849 tests green.
- 2026-10-22 — Completed; fix green (3849 tests). Deferred: criterion 5
  (skip the main cherry-pick when the fix is already on main).
