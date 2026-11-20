---
github_identifier: "#273"
github_url: "https://github.com/SkitterByte/skitterspec/issues/273"
---

# Bug: a PR-mode finish skips every conditional `afterLand` entry

> **Type:** Bug
> **Name:** bug-pr-afterland-range
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/273
> **Author:** Reuben Greaves
> **Raised:** 2026-11-20
> **Area:** `packages/common/src/cli.js` (`specEnvIntegratePr`, `catchUpRange`)
> **Docs:** none: env.config.md carries the range; reference's finish sentence still holds

## Symptom

Reported on Windows, `@skitterbyte/skitterspec-azure-boards` 2.18.0, project in
`FF.CSC.Solution/` below the git root:

- afterLand: `npm ci` when `**/FF.CSC.Solution/package-lock.json`, and
  `tools\client-install.cmd` when `**/ClientApp/package-lock.json`.
- The land changed `FF.CSC.Solution/package-lock.json`.
- `spec-env integrate` (PR mode, after the merge) printed `nothing to run`
  and listed both entries under `skipped (nothing in the land matched)`. The
  primary checkout stayed on the old dependencies until `npm ci` was run by
  hand.

The report suspected the leading `**/`. It is not the cause:
`globToRegExp('**/FF.CSC.Solution/package-lock.json')` is
`^.*FF\.CSC\.Solution/package-lock\.json$`, which matches the top-level path.

## Root cause

`specEnvIntegratePr` (`packages/common/src/cli.js`) computed the finish's range
as `landRange(git, '<remote>/<base>', branch)`, the three-dot
`<remote>/<base>...branch`. The finish is printed only when the branch is
**not** ahead of `<remote>/<base>`, meaning the host merged it, so the
merge-base is the branch tip and the diff is always empty. An empty range is a
known one, so `planTriggered` skipped every entry with a `when`.

## Failing test (red)

`packages/common/test/cli-spec-env-integrate.test.js`, `pr mode: a host-landed
branch (--ff-only|--no-ff) runs the conditional afterLand its files match`.
It uses the reporter's config: the branch touches
`FF.CSC.Solution/package-lock.json`, the host merges, and local main stays
behind. Expected `npm ci   # FF.CSC.Solution/package-lock.json changed`, with
the ClientApp entry skipped. Red:
`after-land, in the primary checkout (…): nothing to run.` with both entries
under `skipped`.

## Fix

- [x] On a landed PR branch, the finish reads `catchUpRange(base,
      <remote>/<base>)`: what local base gains by catching up
- [x] An empty catch-up range reads as unknown, because base may have been
      caught up by hand without running afterLand. The conditional entries
      run (`negative-checks.md` rule 4), and a test pins it
- [x] A planner test pins a leading `**/` against a top-level path, a nested
      one, and a near miss
- [x] Failing test green; full suite green
- [x] `env.config.md` describes the finish's range; `MIGRATION.md` (root and
      each distribution copy) carries the note

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env integrate` PR-mode finish: afterLand range is `base...<remote>/<base>`; empty reads as unknown |
| Config key | update | `afterLand` docs in `env.config.md` |

## Changelog

- 2026-11-20 — Bug reproduced; failing test added (red). The suspected `**/`
  glob was ruled out; the range was empty.
- 2026-11-20 — Fixed: the PR finish reads the catch-up range; test green.
- 2026-11-20 — Completed; fix done, tests green.
