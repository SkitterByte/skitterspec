---
linear_identifier: "SKS-244"
linear_url: "https://linear.app/skitterbyte/issue/SKS-244/bug-relink-reports-nothing-to-do-while-a-shipped-skill-is-not-linked"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: relink reports nothing to do while a shipped skill is not linked

> **Type:** Bug
> **Name:** bug-relink-skips-the-unlinked (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-14
> **Area:** scripts/claude-relink.js, scripts/claude-relink.test.js, scripts/claude-links.test.js

## Symptom

`/spec-reviewed` shipped, landed on `main`, and typing it did nothing — twice.
The operator retyped it thinking they had mistyped; they had not.

    $ ls .claude/skills/ | grep reviewed      # nothing
    $ pnpm relink
    claude-relink: nothing to do — every shipped skill and rule is linked.
    $ pnpm test                                # green

Every other skill was linked. The fixer said there was nothing to fix, and the
guard agreed.

## Root cause

`scripts/claude-relink.js`, `planRelink`. A shipped name with **nothing
installed under it** was classified `absent`, documented as *"shipped but not
installed here. An ordinary state, not a fault: not every distribution installs
every skill. Skipped, per `.claude/rules/negative-checks.md` rule 4."*

That reasoning is right about a **consumer** and wrong about this repo, where
the dogfood convention is that everything shipped is linked. The script was
written for a different failure — a skill arriving as a real **copy** via
`skitterspec update`, to be replaced by a link — so "no entry at all" was never
the case it was looking at.

`scripts/claude-links.test.js` could not catch it either: every guard there
validates the links that **exist** — none dangling, none copies, commands not
links — and none asserted that a shipped skill has one.

**The rule that makes the check safe is what made it blind.** Routing the
unknown to inaction is correct; the mistake was treating a *resolvable target*
as unknown. Something to point at is evidence that the link is missing.

## Failing test (red)

`scripts/claude-links.test.js` — *"a shipped skill that was never installed is
actionable, not skipped"*, against a fixture with one linked sibling and one
composed-but-unlinked skill.

Run: `pnpm exec node --test scripts/claude-links.test.js`

```
✖ a shipped skill that was never installed is actionable, not skipped
  AssertionError: a composed skill with no link is a gap
  'absent' !== 'link'
```

## Fix

- [x] Split `absent` on the evidence: **a resolvable target makes it `link`**, a
      new actionable state; no target keeps it `absent` and skipped.
      `linkTargetFor` already verifies its candidate, so a target is evidence
      rather than a guess.
- [x] Act on both actionable states through one `ACTIONABLE` set — `rmSync` with
      `force` is already a no-op on a missing path, so replacing a stale copy and
      creating a missing link end the same way.
- [x] Add the guard that was absent: **every skill this repo ships is linked**,
      with a stays-silent partner for the uncomposed case.
- [x] Update the test that asserted the old behaviour, splitting it along the new
      boundary rather than deleting it — one half was always right.
- [x] Commit `.claude/skills/spec-reviewed`, which `pnpm relink` now creates by
      itself.
- [x] Failing test now passes (GREEN); `pnpm test` green at the root and in
      `packages/common` — no regressions.
- [x] None.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Script | update | `claude-relink` — `link` state, acted on beside `relink` |
| Repo | add | `.claude/skills/spec-reviewed`, the link that was missing |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-14 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-14 — Fixed: a resolvable target makes an uninstalled skill actionable;
  guard added; tests green (2292). The repaired script repairs the repo on its
  own — `skills: linking 1` — which is the end-to-end proof.
- 2026-09-14 — The existing suite **forced the boundary to be stated precisely**.
  `claude-relink.test.js` asserted "a shipped entry that is not installed is
  skipped, not created", which is exactly what changed — so it was split rather
  than deleted: composed-but-unlinked is a gap, uncomposed is still ordinary.
  Deleting it would have thrown away the half that was always right.
- 2026-09-14 — Third guard today blind in the same shape, after
  `bug-server-start-not-proven` and `bug-next-skips-the-commit`: a check that
  validates what is **present** and never asks whether something that should be
  present is **missing**. Worth noticing as a pattern rather than three
  coincidences.
- 2026-09-14 — Bug reproduced; failing test added (red).
