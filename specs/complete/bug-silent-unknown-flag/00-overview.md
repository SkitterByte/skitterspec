# Bug: an unknown spec-sync flag is silently discarded

> **Type:** Bug
> **Name:** bug-silent-unknown-flag (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** Complete (2026-09-02)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-02
> **Area:** packages/linear/src/cli-sync.js

## Symptom

`spec-sync doctor --write` — the exact invocation that repaired a renamed team in
`skitterspec-linear@10.4.0` — parses, runs the **readiness report** instead,
ignores the flag, and exits **0**:

```
$ spec-sync doctor --write
  scaffold   ok       specs/ + 16 skills installed
  ...
  1 check(s) need attention.
exit=0
```

A script upgrading from 10.4.0 reads that as "repaired". Nothing was repaired.

This is worse than a removed command: a removed command errors and the caller
notices. Here the command name survived a rename into an entirely different
feature, so the old invocation still parses and reports success.

Found while sizing the 11.0.0 release, before publishing.

## Root cause

`specSync`'s flag loop pushes anything it does not recognise onto `positional`
(`packages/linear/src/cli-sync.js`, the `else positional.push(args[i])` arm).
That is right for a spec name and wrong for a flag: unknown flags were dropped
without a word.

Harmless for a typo, fatal for a **renamed** flag. `--write` became `--yes` when
`doctor` became `retarget` (`feat-team-key-retarget`), and the name `doctor` was
then reused by `feat-setup-doctor` for the readiness check — so
`doctor --write` went from meaning one thing, to meaning nothing, while still
looking like it worked.

## Failing test (red)

`packages/linear/test/cli-unknown-flag.test.js` — "doctor --write is refused and
points at retarget", plus "any unrecognised flag is refused, naming it" and "the
refusal happens before the command runs". Run with
`node --test packages/linear/test/cli-unknown-flag.test.js`.

Red output:

```
✖ doctor --write is refused and points at retarget
  AssertionError: it must not report success
    actual: 0
```

## Fix

- [x] Collect `--`-prefixed arguments no branch consumed into `unknownFlags`
      rather than dropping them into `positional`.
- [x] Refuse them **before dispatch**, naming each one, so no command runs on a
      misunderstood invocation.
- [x] Give `--write` a specific hand-off to `spec-sync retarget --yes` — a bare
      "unknown flag" would leave the caller to guess what replaced it.
- [x] Failing tests now pass (GREEN); full suite green — 1002/1002, `pnpm test`.
- [x] Guard against over-reach: a spec name is still a positional, and every flag
      the usage advertises still parses.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-sync *` — an unknown `--flag` now exits 1 instead of being ignored |

Behaviour changes only for invocations that were already wrong. A spec name never
starts with `--`, so no real argument can be swallowed by the new rule.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-02 | In Progress | in-progress | Reuben Greaves |
| 2026-09-02 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-02 — Bug reproduced; failing test added (red).
- 2026-09-02 — Fixed: unknown flags refused before dispatch, with a rename
  hand-off for `--write`; test green.
- 2026-09-02 — Scope widened from the reported `doctor --write` to **any**
  unknown flag: the reported case was one symptom of the `else positional.push`
  arm, and fixing only `--write` would leave the next renamed flag to fail the
  same way.
- 2026-09-02 — Completed; fix verified, tests green (1002/1002).
