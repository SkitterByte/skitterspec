---
linear_identifier: "SKS-237"
linear_url: "https://linear.app/skitterbyte/issue/SKS-237/the-page-knows-where-the-spec-is-in-its-lifecycle"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# The page knows where the spec is in its lifecycle

> **Type:** Feature
> **Name:** feat-page-knows-the-phase (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-14)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-14
> **Area:** packages/common/src/env/review.js, packages/common/src/env/resolve.js, packages/common/assets/review/page.html, packages/common/test
> **Stack:** worktree

## Problem

`feat-verdict-is-the-action` shipped `✓ Commit & Continue`, and the operator
opened it on a **completed** spec — nought files, *"Nothing to review — no
changes found"* — and was still offered a button that commits and builds the next
phase. There is no next phase. There is nothing to commit.

The cause is that **the page knows nothing about the spec beyond its name and
branch**. `collectReview` fills the page with `spec`, `branch`, `totals`, `files`
and `notes`; the base engine has never had a reason to read a spec's phase index,
and only the Linear provider parses phases at all (for its sub-issue mapping,
`packages/linear/src/cli-sync.js`). So the bar offers every verdict on every
render, whatever state the spec is actually in.

One question answers it: **is there an unfinished phase after this one?** No, on
the last phase mid-build. No, on a spec in `complete/`. The two cases the
operator hit are the same case.

## Decisions

1. **The engine answers, the page reasons.** The base engine learns to read a
   spec's phase files — the folder listing plus the overview exclusion the
   provider already does — and `collectReview` carries the answer into the page
   data. The page must not go looking: it is a static artefact spliced once, and
   a page that reads the filesystem is not one.
2. **One question, both cases.** `hasNextPhase` is false on the last phase and
   false on a completed spec, so the last-phase case and the completed-spec case
   need no separate rules. A second rule for the second case is how they drift.
3. **Disabled with the reason, not hidden.** `✓ Commit & Continue — no phase
   left`, following the pattern the open-note block already uses. Rejected:
   hiding it, which the operator proposed — a bar that is sometimes four buttons
   and sometimes three makes a reader who knows it as four wonder whether the
   page failed to render, and the page's own rule is that a disabled control
   states its reason rather than vanishing.
4. **`Commit` stays available on a clean read.** That is deliberate and
   unchanged: a review that found nothing to say is still a review, and *"a
   clean read still commits"* is the page's existing message. Committing an
   empty tree is the commit skill's business to report, not the page's to
   prevent.
5. **Cannot tell is not a refusal.** A spec whose phases cannot be read — a
   legacy bare `<name>.md`, an overview with inline phases, a folder the render
   cannot see — leaves the button **enabled**, exactly as today. The check
   removes an offer that provably cannot work; it must never remove one it
   merely failed to confirm (`.claude/rules/negative-checks.md` rules 1 and 4).

## Solution overview

```
  engine:  read the spec's phase files → { total, done, hasNextPhase }
           ▶ carried into the page data beside `notes`

  page:    hasNextPhase === false  ▶ [ ✓ Commit & Continue — no phase left ]  (disabled)
           hasNextPhase === true   ▶ [ ✓ Commit & Continue ]
           unknown                 ▶ [ ✓ Commit & Continue ]   (unchanged)

  and the open-note block still wins: a note open disables BOTH committing
  buttons, whichever reason each would otherwise have shown.
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Engine | add | a phase reader — `NN-*.md` beside the overview, with each file's status |
| Engine | update | `collectReview` carries `phases` into the page data |
| Page | update | `✓ Commit & Continue` disabled with its reason when no phase follows |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The engine reads the phase index | ✅ | [01-read-the-phases.md](01-read-the-phases.md) |
| 2 | The button reasons from it | ✅ | [02-the-button-reasons.md](02-the-button-reasons.md) |

## Non-goals

- **Refusing to review a completed spec.** Reading what a finished spec did is
  legitimate and stays so. This removes an offer that cannot work, not a page.
- **Blocking `Commit` on an empty diff.** Decision 4.
- **Counting phases to gate anything else.** The one refusal on this page is an
  open comment; a phase count that started refusing things would be the tally
  `feat-review-verdict` Decision 1 forbids, arriving through a side door.

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-14 | Ready | backlog | Reuben Greaves |
| 2026-09-14 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-14 — Phase 2: the precedence is expressed as **one `stop` value** the
  two buttons share, rather than two conditions each deciding for itself. Two
  reasons can be true at once and the label has room for one, so the ordering has
  to live in a single place — and `commit` can only ever be stopped by a note,
  while `commit-continue` can be stopped by either.
- 2026-09-14 — Phase 1: the question is **"is there any phase not done?"**, not
  "is there one after this one" as the overview put it. `/spec-next` builds the
  **first unfinished** phase, so a spec sitting half-way through its *last* phase
  still has one to build — and "after this one" would have disabled a button that
  works. `done < total` is the whole rule, and it answers the last-phase case and
  the completed-spec case identically, which was the point.
- 2026-09-14 — Phase 1: the reader does **not** reuse `findSpecFolder`. That
  searches several roots with preference rules, and there is exactly one tree
  worth looking in — the spec's own worktree. Looking anywhere else would answer
  about a branch that is not the one being reviewed.
- 2026-09-14 — Spec created, from the operator opening the new four-button bar
  on a completed spec and being offered a continue with nothing to continue
  into. Their instinct was to hide the button; Decision 3 disables it with its
  reason instead, on the page's own established grounds — and that same one
  question turns out to cover the completed-spec case too, which was the third
  oddity in the same screenshot.
