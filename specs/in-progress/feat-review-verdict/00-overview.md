---
linear_identifier: "SKS-167"
linear_url: "https://linear.app/skitterbyte/issue/SKS-167/review-verdict-approve-commits-it-changes-send-it-back"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Review verdict — approve commits it, changes send it back

> **Type:** Feature
> **Name:** feat-review-verdict (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-13)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-11
> **Area:** packages/common/src/env/review.js, packages/common/src/env/config.js, packages/common/src/cli.js, packages/common/assets/review/page.html, packages/common/assets/skills/spec-diff, packages/common/assets/core/env.config.md, packages/common/assets/rules, packages/common/test
> **Stack:** worktree

## Problem

`feat-review-round-trip` made the review page two-way: you mark files, write
notes, and paste the pass back. What it cannot do is say **what you concluded**.
Every pass comes back meaning the same thing — "here are some marks" — so the
one outcome a review usually has ("this is fine, land it") still costs a separate
`/commit`, and the other one ("no, do these") is indistinguishable from "I'm just
thinking out loud". The page knows you approved; the workflow does not.

## Decisions

1. **A verdict, not a tally.** `feat-review-round-trip` recorded a rule: the
   marks are information, never a gate; if that is ever wanted it becomes a
   config key defaulting to off, decided deliberately, and it never arrives as a
   tidy-up. This spec is that deliberate decision, and it keeps the distinction
   the rule was protecting: a **verdict** is chosen by a person, once, per review.
   A **counting gate** derives a refusal from how many boxes are ticked. The first
   is what ships here; the second stays forbidden, and the existing tests that
   forbid it stay exactly as they are.
2. **Three verdicts, and no verdict means discuss.** `approve` → commit;
   `changes` → work them now; `discuss` → report and stop. A blob carrying no
   verdict behaves as `discuss`, so today's report-and-wait becomes the **default**
   rather than a special case. Rejected: two buttons with a "talk first" tick (a
   mode hidden inside a button — the page cannot show you which of the two you are
   about to send); per-note tagging (a decision on every note, and a mixed blob
   has no single answer to "what happens now").
3. **Only unresolved comments block `approve`.** You asked for something, so it
   cannot also be fine. Files you never ticked block nothing: a comment is a
   request you made, an unticked file is merely something you said nothing about.
   Requiring every file ticked would be Decision 1's counting gate wearing a hat,
   and would make a 60-file phase a chore before you could approve anything.
4. **Approve hands off to a configured skill; skitterspec never copies one.**
   `/commit` ships with **skittership**, a different package — so an adopter of
   the base distribution may not have it, and vendoring it here would fork a skill
   whose real job includes release notes and the changelog. `env.config.json` gains
   `review.commitWith`, defaulting to `"/commit"`.
5. **Availability is read from the skill list, not from a file path.** Claude
   already knows which skills it has; guessing at `.claude/skills/commit/SKILL.md`
   would be an absence check on one of the several places a skill can legitimately
   live (`.claude/rules/negative-checks.md` rule 1). With nothing to hand off to,
   the fallback commits directly — stage the task's files, run the project's
   typecheck and tests, write a conventional commit — and
   **says which path it took**. `"none"` disables auto-commit and records the
   verdict only.
6. **A verdict is consumed, never stored.** Approve is spent by the commit;
   changes is spent by the work. So an approval cannot go stale and later commit
   something nobody read, and "you have to review it again" falls out for free —
   after the changes land there is no verdict on the page. What *is* kept is a
   one-line **outcome log** (what was decided, when, and the commit it produced),
   because that is history rather than state.
7. **The verdict button is the copy button.** Three buttons, each copying the
   blob with its verdict already set. Choosing a verdict and then separately
   hitting Copy is two actions for one decision, and invites a blob whose verdict
   is not the one you clicked last.
8. **`Approve` / `Request changes` / `Discuss first`.** GitHub's wording for the
   first two: every reviewer already knows which one is the blocking one, and it
   reads correctly in a report ("approved", "changes requested").

## Solution overview

```
     ┌─ Your verdict ─────────────────┐
     │ [ ✓ Approve ]                  │   blocked while any note is open,
     │ [ ↺ Request changes ]          │   with the reason shown on the button
     │ [ … Discuss first ]            │
     └────────────────────────────────┘
                    │  each copies the blob with its verdict set
                    ▼
   approve  → engine refuses it if a note is open  → /spec-diff → commitWith
   changes  → the go-ahead: work the commented files, --resolve, re-render
   discuss  → report the notes, stop and talk        (also: no verdict at all)
```

`env.config.json` gains one key:

```json
"review": { "commitWith": "/commit" }
```

`"/commit"` (the default) · any other skill name · `"none"` to record only.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Blob field | add | `verdict: "approve" \| "changes" \| "discuss"` (optional) |
| Engine | update | `validateNotesBlob` accepts+checks it; approve refused while a note is open |
| Engine | add | outcome log in the notes sidecar (`decisions[]`) |
| CLI output | update | `--json` reports `verdict` and the blocked reason; human line says the verdict |
| Config key | add | `env.config.json` → `review.commitWith` (default `/commit`) |
| Page | update | three verdict buttons replace the single Copy control |
| Skill | update | `/spec-diff` routes on the verdict; the wait rule becomes "wait unless told" |
| Rule/docs | update | `spec-planning.md`, the CLAUDE.md section, `env.config.md`, the docs site |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The verdict in the engine | ✅ | [01-verdict-engine.md](01-verdict-engine.md) |
| 2 | The page's verdict bar | ⬜ | [02-verdict-bar.md](02-verdict-bar.md) |
| 3 | Approve hands off and commits | ⬜ | [03-commit-handoff.md](03-commit-handoff.md) |
| 4 | Changes, discuss, and the docs | ⬜ | [04-routing-and-docs.md](04-routing-and-docs.md) |

## Non-goals

- **Chaining into `/spec-next`.** Approve commits; it does not then build the
  next phase. "Commit what I just read" and "go build the next thing unattended"
  are different sizes of decision, and the second stays a keystroke.
- **Counting ticks.** Decision 1 and 3. `/spec-complete` still never learns about
  unaccepted files, and no phase, commit or completion is refused over them.
- **Pushing.** Approve commits locally, like `/commit` does. Nothing here reaches
  a remote.
- **A verdict on someone else's review.** One verdict per pass, from whoever read
  it; there is no approval quorum and no reviewer identity.

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-11 | Ready | backlog | Reuben Greaves |
| 2026-09-13 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-13 — Phase 1: the outcome log records **honoured** verdicts only. A
  refused approval did not happen, so logging it would leave a trail of
  decisions the repo never took; the refusal is reported instead, and the
  comments still land. Also: the open-comment count is reported as `openCount`
  rather than `open` — a dotted `.open` is the removed opener's spelling, and
  `assets-spec-start-one-path` guards the engine against it returning.
- 2026-09-11 — Spec created, straight out of using `feat-review-round-trip`. It
  is a separate spec rather than a fifth phase there because it does the thing
  that spec lists as a non-goal — gating an action on review state — and the
  non-goal named the only legitimate way for that to arrive. Citing it beats
  quietly editing it.
