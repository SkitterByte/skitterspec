---
github_identifier: "#105"
github_url: "https://github.com/SkitterByte/skitterspec/issues/105"
github_assignee_id: "SkitterByte"
github_assignee_name: "Skitter Byte"
---

# Bug: bare `/spec-live` asks "which spec" while the workbench is held

> **Type:** Bug
> **Name:** bug-bare-live-asks-while-held (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-11-05
> **Area:** packages/common/src/cli.js (`bareLive`), packages/common/test/cli-spec-env-live.test.js
> **Severity:** 3 - Medium
> **Docs:** none: no documented behaviour changes — the bare form still takes
> when unambiguous and free, and reports otherwise; only the misleading ask on a
> held workbench goes

## Symptom

With a spec live on the primary checkout and several specs holding worktrees, a
bare `/spec-live` prints:

```
spec-env live: 17 specs have worktrees — name the one you mean:
  1. bug-action-assignee-native-select-offscreen
  …
```

Naming one then gets `blocked — primary checkout is on feat/test-case-last-run,
not main`. The ask offers something no answer can honour — the workbench is
held, so **every** bare take is refused regardless of which spec is named — and
it buries the status report underneath it, which was already carrying the real
answer (`in-flight: feat-test-case-last-run`).

As experienced (2026-11-05, a consumer repo): a `/spec-live main` release was
**blocked** on uncommitted live fixes, leaving the spec live; a later bare
`/spec-live` then asked the reader to choose between 17 worktrees instead of
saying the workbench was still held. It read as "the engine forgot which spec I
am on" when the true state was "your release never happened".

## Root cause

`bareLive()` in `packages/common/src/cli.js` (~line 5313) checks the two
preconditions for a bare take in the wrong order: it resolves *which spec*
(`provisionedSpecChoice`) first and only then asks whether the workbench is
free. The ambiguity branch emits its "N specs have worktrees — name the one you
mean" note before the held-workbench state has been considered, so the note
prints exactly when it cannot help. The design rule
(`feat-bare-argument-parity`, decision 1) is "take when there is exactly one
answer AND the workbench is free; print the report otherwise" — when the
workbench is not free the ambiguity is moot, and the report alone is the honest
answer (the existing sole-spec test already pins that; the several-worktrees
variant was untested).

## Failing test (red)

`packages/common/test/cli-spec-env-live.test.js` —
`stays silent: a held workbench reports without asking, even with several worktrees`.
Scaffolds two spec worktrees, takes `feat-x` live, runs a bare `spec-env live`,
and asserts the report names `in-flight: feat-x` **without** the
"specs have worktrees" ask. Run:
`node --test --test-name-pattern "held workbench reports without asking" packages/common/test/cli-spec-env-live.test.js`

Red output:

```
✖ stays silent: a held workbench reports without asking, even with several worktrees
  AssertionError: no ask — naming a spec could change nothing
  actual: 'spec-env live: 2 specs have worktrees — name the one you mean:\n  1. feat-x\n  2. feat-y\n…in-flight: feat-x…'
```

## Fix

- [x] Reorder the guards in `bareLive()`: check the workbench (primary on base,
      no receipt) first and return the plain status report when it is not free;
      only then resolve the spec and emit the ambiguity note.
- [x] Failing test now passes (GREEN); run the project's typecheck and test
      commands — confirm no regressions.
- [x] None (no follow-up hardening — the existing sole-spec and free-workbench
      tests pin every other branch).

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env live` (bare form) — held workbench reports without the "name the one you mean" ask |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-11-05 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-11-05 — Fixed: `bareLive()` now checks the workbench before resolving a
  spec, so a held instance gets the plain report; test green (4245 passed).
- 2026-11-05 — Bug reproduced; failing test added (red). Root-caused from a
  consumer repo's session transcript: a blocked release left the workbench
  held, and the bare form's ambiguity note fired before the held check.
