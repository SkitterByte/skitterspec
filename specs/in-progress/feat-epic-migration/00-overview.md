---
github_identifier: "#166"
github_url: "https://github.com/SkitterByte/skitterspec/issues/166"
---

# Epic migration — non-wave phases, retired wave sub-issues, a check before landing

> **Type:** Feature
> **Name:** feat-epic-migration (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/166
> **Author:** Reuben Greaves
> **Raised:** 2026-11-11
> **Area:** packages/common/src/{cli.js,env/epicread.js}, packages/sync-core/src/compare.js, packages/provider-kit/src/apply.js, packages/github/src/{api.js,cli-sync.js}, packages/common/assets/rules/spec-planning.md, packages/github/assets/skills/spec-push/SKILL.md, docs/{reference,github}.html
> **Stack:** worktree
> **Docs:** reference, github

## Summary

Converting a hand-written plan spec into an epic now works end to end: the
guidance says what to do with a phase that is not a wave, the first push of the
epic retires the plan's old wave sub-issues, and `skitterspec epic status
--here` shows the epic as the conversion branch defines it before that branch
lands.

## Problem

Feedback from converting skitterload's `issue-library-and-sessions-plan`. The
migration rule in `spec-planning.md` covers wave phases only, so a plan phase
that is not a wave (skitterload's "test pass through the one-off builder") has
nowhere to go. Deleting the wave phase files leaves their sub-issues on the
tracker, under the same issue that now holds the epic's members: push treats an
id no phase claims as a possibly lost stamp and rightly never acts on one. And
`epic status` reads members and their headers from the base branch, plus member
worktrees, so a conversion done on a `/no-spec` branch cannot be checked until it
has already landed.

## Acceptance criteria

- The migration guidance says a non-wave phase becomes a member of the kind its
  work is, usually an Issue, with its own `Waits on:`.
- Pushing an epic whose snapshot remembers phase sub-issues closes each as not
  planned and unlinks it from the epic's issue, on GitHub; the other trackers
  name the ids and carry on.
- After that push the snapshot no longer remembers them, so the next push is
  empty.
- A normal spec with an unclaimed sub-issue id still retires nothing.
- `skitterspec epic status <epic> --here`, run in a worktree, shows members and
  waits as that tree declares them (uncommitted edits included), while a wait
  still counts as met only on the base branch.

## Decisions

1. **A non-wave phase becomes a member.** It is its own spec, of the kind its
   work is — usually an Issue (manual steps, no code) — carrying
   `> **Epic:**` and its own `> **Waits on:**`. Whatever waited on it waits on
   that member. *Rejected:* keeping phases on an epic — an epic holds no check
   it cannot observe (feat-epics, Decision 10).
2. **Push retires an epic's leftover sub-issues.** An epic has no phases by
   construction, so every sub-issue id its snapshot remembers is a leftover —
   a positive signal, where an unclaimed id on any other kind stays the
   lost-stamp ambiguity it is today (`.claude/rules/negative-checks.md`).
   `planChanges` lists them as `subIssues.retire`; `applySpecPlan` runs them
   through a new optional `retireSubIssue(id)` seam: close as not planned, then
   unlink from the parent. *Rejected:* a separate `spec-sync retire` command —
   one more step to remember on a path that already has a positive signal.
3. **GitHub implements the seam; Linear, Jira and Azure say they cannot**,
   naming each id, exactly as `setParent` behaves where it is absent. Never
   fatal: a failed retire is a `??` line, and that id stays in the snapshot so
   the next push tries again.
4. **`epic status --here` reads headers from the working tree, waits from the
   base branch.** Members, `Epic:`, `Waits on:`, `Lanes:` and phase files come
   from the tree the command runs in, uncommitted edits included; a wait is met
   only on the base branch, unchanged. *Rejected:* `--ref <branch>` — it sees
   only committed edits, and a conversion is checked before it is committed.

## Solution overview

```
migration worktree (/no-spec)
  git mv issue-x → epic-x · Type: Epic · delete wave phases
  non-wave phase → issue-<name> member (Epic:, Waits on:)
  skitterspec epic status epic-x --here   ← reads this tree; met = base
land → /spec-push epic-x
  plan.subIssues.retire = [#163 … #167]   ← epic + snapshot ids
  apply: close not_planned, unlink · snapshot forgets them
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `skitterspec epic status [<epic>] --here` |
| Domain object | update | push plan `subIssues.retire` (epic only) |
| Service | add | provider-kit seam `retireSubIssue(id)`; GitHub close + unlink |
| Skill/rule | update | `spec-planning.md` migration paragraph; `/spec-push` MCP path retires |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `epic status --here` | ✅ | [01-status-here.md](01-status-here.md) |
| 2 | Retire an epic's leftover sub-issues | ✅ | [02-retire-subissues.md](02-retire-subissues.md) |
| 3 | Migration guidance and docs | ⬜ | [03-guidance.md](03-guidance.md) |

## Open questions

- None

## Changelog

- 2026-11-11 — Spec created from skitterload's feedback on converting its
  library plan to an epic.
- 2026-11-11 — Phase 1: `epicStatus` takes `waitIndex`/`waitRead`, so members
  can be read from one tree and waits resolved against another; `--here` reads
  the project folder of the checkout's own git root.
- 2026-11-11 — Phase 2: a tracker without the seam names the ids once and
  they are then forgotten — keeping them would make every later push non-empty
  for good. A failed retire is kept (`recordPush` `keepSubIssues`), and the MCP
  path keeps one with `spec-sync record --keep-sub-issue <id>`.
