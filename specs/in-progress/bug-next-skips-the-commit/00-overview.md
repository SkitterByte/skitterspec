---
linear_identifier: "SKS-225"
linear_url: "https://linear.app/skitterbyte/issue/SKS-225/bug-a-skill-leaves-the-tree-dirty-then-tells-you-to-run-what-refuses"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: a skill leaves the tree dirty, then tells you to run what refuses it

> **Type:** Bug
> **Name:** bug-next-skips-the-commit (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixed (test green)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-14
> **Area:** packages/common/assets/skills/spec-next/SKILL.md, packages/common/assets/skills/spec-bug/SKILL.md, packages/common/assets/rules/spec-reports.md, packages/common/test/assets-report-contract.test.js

## Symptom

A phase finishes green, the report's last row reads `/spec-next → phase 2`, you
type it — and it refuses, because the phase you just built is still uncommitted.

Observed live: the first `/spec-next` of a session refused with *"phase 1 is
uncommitted"*, and later the same session's own reports said `/commit, then
/spec-next` three times and then dropped the commit on the fourth, because the
contract's worked example omits it.

`Next` is the one row in the block a reader is meant to act on
(`spec-reports.md`: *"the closing row should be the one that moves the work
on"*). A `Next` that refuses is worse than no `Next`: it spends the reader's
trust in the row that was designed to be the trustworthy one.

## Root cause

Two sections of the same file, `packages/common/assets/skills/spec-next/SKILL.md`:

- **§6, line 311** — `Do **not** `git commit` unless the user asks — finish,
  verify, and wait.` The skill deliberately ends with the phase uncommitted.
- **§6 Report, line 327** — `` `Next` names the phase, as `/spec-next → phase 3
  (Auth)` `` — the worked example that omits the commit.
- **§2, line 126** — `If prior-phase work is still uncommitted, **stop and
  suggest committing it first**.` The command the example names refuses on
  exactly the state the example was reached in.

`packages/common/assets/skills/spec-bug/SKILL.md:273` has the same shape:
it leaves the tree dirty and points `Next` at `/spec-complete`, whose §2 refuses
on pre-existing uncommitted changes.

**Underneath both**, `assets/rules/spec-reports.md` defines `Next` as *"the
single next action for this work"* with nothing tying it to the state the run
leaves behind. Two skills independently wrote an unrunnable `Next`, which is the
signature of a missing rule rather than two slips.

## Failing test (red)

`packages/common/test/assets-report-contract.test.js` —
*"a skill that leaves the tree dirty tells you to commit before the next step"*.
It takes every skill whose Report prescribes a `Next`, keeps the ones that also
say *"Do **not** `git commit`"*, and asserts the prescription names `/commit`.
A second test asserts the rule itself carries the constraint.

Run: `pnpm exec node --test packages/common/test/assets-report-contract.test.js`

```
AssertionError: a skill leaves the tree dirty and its Next omits the commit:
  common:spec-next — `Next` names the phase, as `/spec-next → phase 3 (Auth)`, so the block says
  common:spec-bug — `Next` points at `/spec-complete` to verify and archive it (**when isolated**,
```

## Fix

- [x] `spec-reports.md`: state the constraint on `Next` — it must be runnable
      from the state the run actually leaves behind, so a skill that does not
      commit names the commit first.
- [x] `spec-next`: the worked example becomes `/commit, then /spec-next → phase
      3 (Auth)`.
- [x] `spec-bug`: `Next` names the commit before `/spec-complete`.
- [x] Both tests green; run the project's typecheck and test commands — confirm
      no regressions.
- [x] None.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill | update | `spec-next` · `spec-bug` — the prescribed `Next` |
| Rule | update | `spec-reports.md` — `Next` must be runnable as left |
| Test | add | report-contract guard + its stays-silent case |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-14 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-14 — Fixed: the rule now constrains `Next` to be runnable from the
  state the run leaves behind, and both skills name the commit; test green. The
  guard's first draft had a bug of its own worth recording — a lazy regex ending
  `(?=\n\n|$)` under the `m` flag, where `$` is end of **line**, so it read one
  line of a multi-line paragraph and stayed red against a prescription that was
  already correct. Sliced with `indexOf` from a line-anchored match instead.
- 2026-09-14 — Bug reproduced; failing test added (red). Found by the operator
  noticing a report that dropped `/commit` from `Next` where the three before it
  had kept it — the inconsistency was the symptom, and the contract's own
  example was the cause.
