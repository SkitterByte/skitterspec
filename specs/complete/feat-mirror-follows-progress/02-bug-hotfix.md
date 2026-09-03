---
linear_issue_id: "SKS-36"
---

# Phase 2 — `/spec-bug` and `/spec-hotfix` refresh after the fix ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** both incident skills refresh the mirror after they tick the Fix tasks,
without disturbing the link seam that must stay ahead of the work.

## Tasks

- [x] Add `<!-- seam:spec-tracker-progress -->` to `/spec-bug` after step 5
      ("Drive to GREEN", which ends by ticking the Fix tasks) and before
      `## 6. Report`.
- [x] Add the same marker to `/spec-hotfix` after step 6 and before `## 7. Report`.
- [x] Leave both `<!-- seam:spec-tracker-link -->` markers where they are. The
      existing assertion `linking precedes the fix` stays true and stays correct
      — see decision 4.
- [x] Extend the existing `links the spec it just wrote, before driving the fix`
      loop so it also asserts the progress seam falls **after** the green step,
      i.e. `link < greenStep < progress`. One ordering assertion per skill, so a
      future edit cannot swap them.
- [x] Cover the case that motivated this: a spec whose fix completes inside
      `/spec-bug` (never reaching `/spec-go`) still gets its ticks mirrored.
- [x] Keep both skills provider-neutral in their own source — extend the existing
      `creating and reviewing skills stay provider-neutral` check if it does not
      already cover the new text.
- [x] Run `pnpm test` — green before the phase is done.

## Notes

`/spec-bug` step 5 can also **split the fix into phase files** and hand off to
`/spec-go`. That path is already covered by Phase 1 once `/spec-go` picks the
spec up; the seam added here is for the single-pass fix that never leaves this
skill.
