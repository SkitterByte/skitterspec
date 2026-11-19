---
github_identifier: "#265"
github_url: "https://github.com/SkitterByte/skitterspec/issues/265"
---

# Bug: `/spec-next` after `/spec-live main` refuses a spec that is in flight

> **Type:** Bug
> **Name:** bug-live-release-forgets-spec
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/265
> **Author:** Reuben Greaves
> **Raised:** 2026-11-19
> **Area:** `packages/common/src/cli.js` (bare resolve, `live release`/`take`, `down`), `packages/common/src/env/live.js`, `spec-next` skill
> **Docs:** reference

## Symptom

Reported from ereqs (skitterspec-azure-boards as installed there):

1. `/spec-start feat-x` — the session is in `../ereqs-wt/x`.
2. `/spec-live` (take) — primary on `feat/x`, worktree detached.
3. `/spec-live main` (release) — primary back on `main`, `feat/x` re-isolated.
   The session's cwd is now the primary checkout.
4. `/spec-next` — `spec-env live status` prints `live:` with no value;
   `spec-env resolve` prints *"no spec given, and 17 specs have worktrees —
   name the one you mean…"*; the skill refuses with *"no spec in flight — run
   /spec-start <name> to start one"*.

Every take-then-release cycle in ereqs (10+ worktrees) ends in this refusal,
and the wording sends the user to `/spec-start` for a spec already started.

## Root cause

`specEnvLiveRelease` (`cli.js`) clears the live receipt and keeps nothing, so
once the primary checkout is back on base nothing records which spec was just
there. `provisionedSpecChoice` (`cli.js`) — what every bare spec-env verb
resolves through — has two rungs only: the worktree cwd is inside, else the
sole provisioned spec. From the primary checkout with several worktrees it
throws, and `resolve` has no machine-readable way to say *several* rather than
*none*, so `/spec-next` §1 collapses both into "no spec in flight". (The
`live:` "with no value" is the bare status report's header; the skill's rung 1
reads a line only the per-spec form prints.)

## Failing test (red)

`packages/common/test/cli-spec-env-live-last.test.js` —
`node --test test/cli-spec-env-live-last.test.js` in `packages/common`:

```
not ok 1 - take → release → a bare resolve names the released spec
  error: no spec given, and 2 specs have worktrees — name the one you mean, …
```

Six of ten fail (take→release→resolve, A→B, take clears the record, release
names `--worktree`, `resolve --json` reason, `resolve --json` via); the four
stays-silent cases pass before and after.

## Fix

- [x] `env/live.js`: a `last-live.json` record beside the receipt —
      read never throws (missing/malformed → null), write, clear
- [x] `live release` writes it; `live take` of another spec clears it; `down`
      clears it when it names the spec torn down
- [x] `provisionedSpecChoice`: from the primary checkout, a recorded spec that
      is still provisioned answers after "inside a worktree" and before "sole";
      stale or unreadable falls through
- [x] `resolve --json`: `{ ok, spec, via, … }` or
      `{ ok: false, reason: 'ambiguous' | 'none', candidates: [{ spec, worktree }] }`;
      text gains a `via:` line
- [x] `live release` prints the worktree path and `/spec-next --worktree <path>`
- [x] `spec-next` §1: rung 1 reads `in-flight:`; rung 4 reads `resolve --json`;
      the refusal tells `none` from `ambiguous` and names `--worktree <path>`
- [x] `docs/reference.html` resolve/live rows; `verify reference`
- [x] Failing test now passes (GREEN); typecheck + full suite green

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env resolve` — last-live rung, `--json`, `via:` line |
| CLI command | update | `spec-env live release` — records last-live, prints worktree + `/spec-next --worktree` |
| CLI command | update | `spec-env live take`, `spec-env down` — clear the record |
| Config key | add | `.spec-env/last-live.json` (gitignored runtime state) |
| Skill/rule | update | `spec-next` §1 — refusal distinguishes none / ambiguous |

## Changelog

- 2026-11-19 — Bug reproduced; failing test added (red).
- 2026-11-19 — Fixed: release records the last-live spec, bare resolve takes
  it from the primary checkout, `resolve --json` reports `ambiguous`/`none`,
  and `/spec-next` refuses each in its own words; test green (5309 flat,
  nested green).
- 2026-11-19 — Decision: bare `/spec-live` does not use the record. It switches
  a branch, and its safety argument is a single possible meaning; the record is
  a hint for naming a spec, not for acting on one.
- 2026-11-19 — Decision: the ambiguity error and `--json` candidates list each
  spec's project folder (what `resolve` prints as `worktree:`), so the path
  pastes straight into `/spec-next --worktree`.
- 2026-11-19 — Completed; all fix tasks done, tests green.
