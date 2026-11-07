---
github_identifier: "#126"
github_url: "https://github.com/SkitterByte/skitterspec/issues/126"
---

# Bug: a crashing engine reads as a refusal, and locks the session

> **Type:** Bug
> **Name:** bug-hook-crash-reads-as-refusal (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/126
> **Author:** Reuben Greaves
> **Raised:** 2026-11-07
> **Area:** packages/common/assets/hooks/review-gate.cjs, packages/common/assets/hooks/main-guard.cjs, packages/common/test/env-review-hook.test.js, packages/common/test/main-guard-hook.test.js
> **Severity:** 2 - High
> **Docs:** none: hook internals; no page describes how a hook reads the engine's exit

## Symptom

While building `feat-in-flight-status` phase 1, a half-finished edit left
`packages/common/src/env/handoff.js` exporting `phaseProgress` after its
definition had moved, so every engine call died at load with a
`ReferenceError`. From then on **every** Bash call was denied with:

```
PreToolUse:Bash hook error:

This phase is waiting on a verdict. Relay these to the operator rather than choosing one: …
```

The reason opens on an empty line, because the engine printed nothing. Nothing
was armed: the gate read `clear` minutes earlier. Edits were refused too, by
`main-guard.cjs`. The operator's `!` command to fix the file was refused the
same way, so the only way out was a terminal outside the session.

## Root cause

Both hooks treat **exit status 1** as the engine's refusal:
`review-gate.cjs:120` and `main-guard.cjs:146` (`if (result.status !== 1) allow()`).
Node exits 1 on an uncaught exception, so an engine that cannot even load is
read as "a verdict is owed" (or "this write lands on main"). Each hook's header
says it fails open on a crash. The tests that claim it (`it allows when the
engine crashes`; `STAYS SILENT: an engine that exits non-1`) stub exits 3 and 2,
the crashes that were already safe. The review-gate one passes
`"node stub.js"` as a single `SKITTERSPEC_BIN`, which `spawnSync` cannot run,
so its stub never executed at all.

An exit status alone cannot tell a refusal from a crash. The positive signal
(`.claude/rules/negative-checks.md` rule 1) is the refusal the engine **prints**:
`spec-env review gate: …` and `spec-env main: …`. A crash prints neither.

## Failing test (red)

- `packages/common/test/env-review-hook.test.js` — *stays silent: an engine
  that throws (exit 1, no output) is a crash, not a refusal*
- `packages/common/test/main-guard-hook.test.js` — *STAYS SILENT: an engine
  that throws (exit 1, no output) is a crash, not a refusal*

Each stubs an executable engine that throws a `ReferenceError` at load (exit 1,
stack on stderr, empty stdout), and asserts the hook prints no decision.
`node --test packages/common/test/env-review-hook.test.js packages/common/test/main-guard-hook.test.js`:

```
ℹ pass 45
ℹ fail 2
  actual: '{"hookSpecificOutput":{…"permissionDecision":"deny","permissionDecisionReason":""}}'
```

## Fix

- [x] Deny only when the engine exits 1 **and** its stdout carries its own
      refusal line (`spec-env review gate:` / `spec-env main:`); anything else
      is a crash and allows. Both hooks, with the blind spot named beside the
      check.
- [x] Make the existing review-gate crash test run its stub (an executable,
      not a `"node stub.js"` string), so it proves what its name says.
- [x] Failing tests now pass (GREEN); `pnpm test` green with no regressions.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Hook | update | `review-gate.cjs`, `main-guard.cjs`: refuse on exit 1 + the engine's refusal line, never on exit 1 alone |

## Changelog

- 2026-11-07 — Bug reproduced; failing tests added (red). Surfaced as a
  follow-up of `feat-in-flight-status`.
- 2026-11-07 — Fixed: both hooks deny only on exit 1 plus the engine's own
  refusal line (`isRefusal`), and the old crash test now really runs its stub.
  Tests green (4489). This repo's own `.claude/hooks/` copies pick up the fix
  on the next `skitterspec update`.
