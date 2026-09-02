# Bug: doctor calls a healthy scaffold broken when a bucket is empty

> **Type:** Bug
> **Name:** bug-scaffold-empty-buckets (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** Complete (2026-09-02)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-02
> **Area:** packages/linear/src/doctor.js, packages/linear/src/cli-sync.js

## Symptom

On a perfectly healthy repo with no spec currently in progress:

```
skitterspec doctor:
  scaffold   broken   specs/ is missing in-progress
                      → skitterspec init --resync
  ...
  2 check(s) need attention.
```

and it exits **1**. Found by running `doctor` on this repo minutes after landing
`feat-setup-doctor` — `specs/in-progress/` was empty because every spec had just
been moved to `complete/`.

Nothing is wrong with the repo, and `skitterspec init --resync` would fix
nothing. Worse, `doctor` is the command a skill runs to branch on readiness, so a
false `broken` fails the run for every caller.

## Root cause

`scaffoldCheck` treated a missing lifecycle bucket as a half-install and returned
`broken` (`packages/linear/src/doctor.js`, the `missing.length` branch as
shipped).

**Git does not track empty directories.** `specs/in-progress/` therefore vanishes
from a clone whenever no spec is in progress, and reappears the moment one starts
— every lifecycle skill runs `mkdir -p specs/<bucket>` before it moves a spec.
So bucket presence is not a property of the install at all; it is a property of
whether any spec happens to be in that state.

`init` does create all four (`SPEC_FOLDERS`, `packages/common/src/init.js:47`),
which is what made the check look reasonable when written — it is true right after
`init` and false forever after.

## Failing test (red)

`packages/linear/test/doctor.test.js` — "an empty lifecycle bucket is not a broken
scaffold", plus "every bucket missing is still fine when the scaffold itself is
there" and "specs/ without .core IS a broken scaffold". Run with
`node --test packages/linear/test/doctor.test.js`.

Red output:

```
✖ an empty lifecycle bucket is not a broken scaffold
  AssertionError: a missing empty bucket is normal, not damage
    actual: 'broken'
```

## Fix

- [x] Stop checking lifecycle buckets in `scaffoldCheck` entirely — their absence
      carries no information about the install.
- [x] Check `specs/.core/` instead: `init` always writes the config templates and
      the manifest into it (`init.js:110`), so it is never an empty directory and
      git keeps it. That is the signal a half-install actually breaks.
- [x] Gather `scaffold.core` in `cli-sync.js`; keep gathering `buckets` for
      context but stop deciding on it.
- [x] Failing tests now pass (GREEN); full suite green — 991/991, `pnpm test`.
- [x] Regression cover at the CLI level too: a scaffolded repo with
      `specs/in-progress/` removed reports `scaffold ok` and exits 0, while one
      with `.core` removed is still `broken`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-sync doctor` — scaffold row no longer false-flags an empty bucket |

The report's shape, states and exit-code contract are unchanged; only which
condition counts as a broken scaffold.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-02 | In Progress | in-progress | Reuben Greaves |
| 2026-09-02 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-02 — Bug reproduced; failing test added (red).
- 2026-09-02 — Fixed: check `.core` rather than the lifecycle buckets; test green.
- 2026-09-02 — Note: an obsolete unit test ("a half-installed scaffold is broken,
  not missing") asserted the very behaviour being retired, and one CLI fixture
  built buckets without `.core`. Both were corrected — the fixture now matches
  what `init` really produces.
- 2026-09-02 — Completed; fix verified, tests green (991/991).
