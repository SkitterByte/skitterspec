# Bug: `live-on` is unachievable — the gate denies the commit it needs

> **Type:** Bug
> **Name:** bug-live-on-gate-deadlock (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-09-21)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-21
> **Area:** `packages/common/src/env/review.js`, `packages/common/src/cli.js`, `packages/common/assets/skills/spec-diff/SKILL.md`

## Symptom

A reader pressed **"▶ Commit & put it live"** on the review page at the end of
phase 3 of `feat-budget-total-calculation` (reported from `ereqs`, on
`@skitterbyte/skitterspec-linear` 17.2). Nothing went live, nothing was
committed, and the run reported a refusal:

```
spec-env live take: blocked — feat-budget-total-calculation's worktree has
uncommitted changes — commit or stash them in
/Users/reubengreaves/code/ereqs-wt/budget-total-calculation first
(the rebase cannot run over them).
  Commit first, then go live: /commit
```

The button names a commit it depends on; the commit is refused by a sibling
guard. **The action cannot succeed in the only state it is offered in**, so
every press of it, by anyone, ends in a refusal — which is the shape
`.claude/rules/spec-reports.md` names as teaching the reader that the buttons
on the page are decorative.

Repro (the engine half, which is the decisive link): render a page and arm the
gate, hold a pass carrying `action: "live-on"`, claim it, then ask the hook
about a `git commit` in that spec's worktree — it answers `deny`.

## Root cause

Three components each behave as designed, and the conjunction is impossible:

1. `src/env/review.js:616` — `const canCommit = buttons !== 'midrun'`, and
   `:630` — `action: live.state === 'off' && canCommit ? 'live-on' : null`. The
   press is offered **only** on a non-midrun render, which is what a finished
   phase produces.
2. A finished phase **arms the gate** (`/spec-next` §5, `/spec-bug` §5b render
   then `review arm`). So every render that offers the button is a render whose
   gate is armed — the two conditions are one condition.
3. `live-on` is absent from `COMMITTING` (`src/env/review.js:753`), deliberately:
   looking at a change running is not reading its diff, so the phase still owes
   a verdict afterwards.
4. Nothing performs the commit the action needs. The engine only *reports* the
   action (`src/cli.js:2959`) and `src/env/live.js` contains no commit; the
   handler is `/spec-diff` §2b, which hands off to `review.commitWith`.
5. `specEnvReviewGate` (`src/cli.js:2342`) has no notion of a commit that is a
   **precondition** rather than an answer, so `review-gate.cjs` denies the
   handler's `git commit`.

The root cause is (5): the gate treats every commit in the spec's worktree as
the phase's answer, and a claimed `live-on` is the one case where a commit is
the action's mechanical precondition instead.

## Decisions

**The engine does not make the commit.** The handoff's preferred fix was
`live take --commit-first`. It is rejected: that engine-authored commit would
*be* the phase's permanent commit, with a machine-written message and no
typecheck, no tests, no `Release-Note:` and no `Refs:` trailer — and the later
committing verdict would then find nothing to commit. `/spec-diff` §2b already
documents the right handler (hand off to `review.commitWith`), so the smaller
and more faithful fix is to stop denying it. It also disposes of the handoff's
own "an engine-run commit must not sweep in another session's staged work"
hazard by never making one: `/commit` already bounds itself with an explicit
pathspec.

**Not by adding `live-on` to `COMMITTING`.** The reasoning at `review.js:544`
is right and untouched.

**A permit, bound to the worktree HEAD.** Claiming a `live-on` pass records on
the gate sidecar that one commit is this action's precondition, stamped with
the worktree's HEAD at that moment. `gate --check --for-command` honours it only
while that HEAD is unchanged — so it dies the instant its commit lands, and a
failed commit can be retried. It is granted only when the worktree is **dirty**
(a clean tree has no precondition, so there is no permit left lying around to
cover some later commit), and only when the gate is **armed** (nothing to permit
past otherwise).

**The permit is not the gate.** `gateState` still answers `armed`, so
`/spec-next` still refuses to build the next phase and the obligation is still
discharged only by a committing verdict or a recorded skip.

## Failing test (red)

`packages/common/test/env-review-live-on-commit.test.js` — run with
`cd packages/common && node --test test/env-review-live-on-commit.test.js`.

Three of its ten cases are red; the other seven are the stays-silent half
(`.claude/rules/negative-checks.md` rule 3), which pass vacuously today and
guard the widening.

```
✖ the commit a claimed live-on needs is permitted
    permissionDecision: 'deny' — 'feat-alpha is awaiting a verdict (phase 2)'
✖ the gate reports the permit, and still reports itself armed
✖ the permit covers this spec's worktree and nowhere else
```

## Fix

- [x] `review.js`: a `permit` on the gate sidecar — `grantPermit`, `permitHonoured`,
      cleared by `armGate` (new phase) and `disarmGate`; reported by `gateState`.
- [x] `cli.js`: grant it when a claimed pass carries `action: 'live-on'`, the
      gate is armed and the worktree is dirty; honour it in the
      `--for-command` branch of `specEnvReviewGate`.
- [x] `/spec-diff` §2b: say that the gate permits this one commit, and that it
      is still not a verdict.
- [x] Failing test now passes (GREEN); run the project's typecheck and test
      commands — confirm no regressions.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Sidecar | update | `<spec>.gate.json` gains an optional `permit` (version unchanged) |
| CLI command | update | `spec-env review gate --json` gains an optional `permit` |
| CLI command | update | `spec-env review --claim` grants the permit on a `live-on` pass |
| Skill/rule | update | `spec-diff` §2b — the gate permits `live-on`'s commit |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-21 | In Progress | in-progress | Reuben Greaves |
| 2026-09-21 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-21 — Bug reproduced; failing test added (red).
- 2026-09-21 — Fixed: the gate records a HEAD-bound permit when a `live-on`
  pass is claimed, so the one commit that press depends on is no longer
  refused; test green, 3508 pass.
- 2026-09-21 — Rejected the handoff's preferred `live take --commit-first`:
  an engine-authored commit would become the phase's permanent commit, with no
  tests, no Conventional Commit message and no `Release-Note:`/`Refs:` footers.
  `/spec-diff` §2b already names the right handler; the fix is to stop denying
  it.
- 2026-09-21 — Completed; fix landed, all tests green (3508).
