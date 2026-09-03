---
linear_identifier: "SKS-34"
linear_url: "https://linear.app/skitterbyte/issue/SKS-34/the-mirror-follows-progress-not-just-status"
---

# The mirror follows progress, not just status

> **Type:** Feature
> **Name:** feat-mirror-follows-progress (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-03
> **Area:** packages/common/assets/skills/spec-go/SKILL.md, packages/common/assets/skills/spec-bug/SKILL.md, packages/common/assets/skills/spec-hotfix/SKILL.md, packages/linear/assets/seams/, packages/common/test/assets.test.js
> **Stack:** worktree

## Problem

Three lifecycle skills write spec progress **after** their last tracker seam, so
the mirror never sees it. Phase sub-issues sit in Backlog for the whole build and
all flip to Done at `/spec-complete` — the tracker is a lagging record rather
than a live one, which defeats phases being assignable sub-issues at all.

- **`/spec-go`** flips a phase to `🔄` (`:154`) and to `✅` plus task ticks
  (`:170`), both after its only seam at `:148`. That seam is also **optional**
  under `mapping.phases: "subissue"` — this repo's effective default, since
  `specs/.core/linear.config.json` sets no `mapping` — so in practice it does not
  run either.
- **`/spec-bug`** (`:161`) and **`/spec-hotfix`** (`:172`) link before their
  "Drive to GREEN" step, which ends by ticking the Fix tasks. Task checkboxes are
  part of the projection (`parseTaskLine`, `packages/sync-core/src/normalize.js:311`).

The engine is not at fault: `phaseStateBucket`
(`packages/sync-core/src/normalize.js:307`) already maps `⬜`/`🔄`/`✅` onto
`backlog`/`in-progress`/`complete`. Nothing calls it at the right moment.

This survived because the backstop only checks **presence**.
`packages/common/test/assets.test.js:308` asserts each lifecycle skill contains a
seam marker, and passes — while `/spec-complete`, `/spec-cancel` and
`/spec-review` each have a dedicated **placement** test and the three defective
skills have none.

## Decisions

1. **Relocate `/spec-go`'s seam into step 4, after the `🔄` flip** — and rename
   the fragment `spec-go-pull` → `spec-go-start`, since it now fires at phase
   start and is a push. Rejected leaving it at 3b: it runs before any
   phase-level write, so no placement fix downstream can rescue it.
2. **That push becomes mandatory under `subissue` too.** "Optional — refresh now
   or later" was defensible at 3b, where nothing phase-level had changed yet.
   Once the seam sits after a real state change, optional means the state change
   is usually not mirrored.
3. **A new shared fragment `spec-tracker-progress`, not a reuse of `spec-tracker-sync`.**
   Rejected reuse: that fragment's "Why it sits here"
   section documents `git mv`-then-commit ordering which none of these three
   skills have, and the build would inject that wrong prose verbatim.
4. **`/spec-bug` and `/spec-hotfix` keep their link seam before the fix** and
   gain the progress seam after the ticks. Rejected moving the link seam later:
   the existing test's reasoning is correct — the issue must exist *while* the
   work happens, not be backfilled once it is over.
5. **The backstop becomes a placement map, not a prose scanner.** Rejected
   scanning every SKILL.md for `⬜`/`🔄`/`✅`: `spec-review:63` mentions all three
   descriptively while defining the convention, so a scanner accuses a correct
   skill. Naming each skill's last write site keeps the check a positive signal
   (`.claude/rules/negative-checks.md` rule 1).
6. **A mid-phase push leaves the base snapshot uncommitted, and that is accepted.**
   Every apply records a snapshot under `specs/.core/linear-base/`
   (`packages/linear/src/cli-sync.js:1262`), and `/spec-go` deliberately does not
   commit. The next `/commit` sweeps it. Rejected teaching `/spec-go` to commit:
   it would break the one-commit-per-phase convention step 3 enforces.
7. **Never mint, never fatal** — inherited verbatim from `spec-tracker-sync`. An
   unlinked spec is skipped in one line; a failed push is reported and the skill
   finishes anyway. The mirror is disposable, the repo is not.

## Solution overview

One new seam fragment, one relocated-and-renamed fragment, three skills wired,
one backstop upgraded.

```
/spec-go      step 4: heading → 🔄   <!-- seam:spec-go-start -->        (moved, mandatory)
              step 5: heading → ✅   <!-- seam:spec-tracker-progress --> (new)
/spec-bug     step 5: tick tasks     <!-- seam:spec-tracker-progress --> (new)
/spec-hotfix  step 6: tick tasks     <!-- seam:spec-tracker-progress --> (new)
```

The base distribution composes every marker to nothing, so a tracker-free repo is
unaffected — the existing build guard already fails on a raw marker reaching a
built package.

**Non-goals.** Progress edited by hand outside the skills (ticking a box in an
editor) stays unmirrored until the next push — `/spec-status` already reports
that as drift, and watching the filesystem is a different feature. No engine
change: `/spec-push` and `phaseStateBucket` already do the right thing.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Seam fragment | add | `spec-tracker-progress.md` |
| Seam fragment | update | `spec-go-pull.md` → `spec-go-start.md` (`git mv`) |
| Skill/rule | update | `/spec-go` — seam relocated to step 4, progress seam after step 5 |
| Skill/rule | update | `/spec-bug`, `/spec-hotfix` — progress seam after the tick step |
| Test | update | `assets.test.js:308` presence map → placement map |
| Test | add | placement tests for the three skills; stays-silent test |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `/spec-go` mirrors phase start and phase completion | ⬜ | [01-spec-go.md](01-spec-go.md) |
| 2 | `/spec-bug` and `/spec-hotfix` refresh after the fix | ⬜ | [02-bug-hotfix.md](02-bug-hotfix.md) |
| 3 | The backstop checks placement, not presence | ⬜ | [03-placement-backstop.md](03-placement-backstop.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-03 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-03 — Spec created. Audit found the defect in three skills, not one:
  `/spec-bug` and `/spec-hotfix` tick tasks after their link seam, which the
  presence-only backstop could not see.
