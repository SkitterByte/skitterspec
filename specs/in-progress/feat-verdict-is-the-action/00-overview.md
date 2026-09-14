---
linear_identifier: "SKS-233"
linear_url: "https://linear.app/skitterbyte/issue/SKS-233/the-verdict-is-the-action-commit-commit-and-continue-changes-discuss"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# The verdict is the action — commit, commit & continue, changes, discuss

> **Type:** Feature
> **Name:** feat-verdict-is-the-action (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-14)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-14
> **Area:** packages/common/src/env/review.js, packages/common/src/env/config.js, packages/common/src/cli.js, packages/common/assets/review/page.html, packages/common/assets/skills/spec-diff, packages/common/assets/core/env.config.md, packages/common/assets/rules/spec-planning.md, packages/common/test, docs/index.html
> **Stack:** worktree

## Problem

The review page says `✓ Approve`, and approving is the one thing on it that does
not describe what happens. Worse, the engine can be configured so that it
genuinely does nothing: `review.commitWith: "none"` records the verdict and
commits, builds and changes nothing at all.

The operator put it plainly: *"there's no point having an 'accept' that actually
does NOTHING when you come back and tell the agent to read it — the whole point
of a review is the guard before committing."* A review is not an opinion filed
for later. It is the gate in front of an action, and the verdict should name the
action it releases.

There is a second gap behind the first. Reading a diff on a phone is worth doing
because you are away from the terminal — and then the workflow marches you back
to it to type `/spec-next`. An approval that commits but cannot carry on is
exactly the halfway state the operator is objecting to, one step further along.

## Decisions

1. **The verdict names the action.** `commit` · `commit-continue` · `changes` ·
   `discuss`. `approve` is renamed, not merely relabelled: the stored log, the
   CLI line and the button all say the same word, and that word is what will
   happen. Old sidecars carrying `approve` are read as `commit` — they are
   gitignored, so this is tolerance rather than migration.
2. **`commit-continue` is a fourth verdict, not a flag on `commit`.** A
   `{ verdict, continue }` pair is two fields for one choice, and
   `feat-review-verdict` Decision 7 exists because the button pressed must *be*
   the decision recorded. It is blocked by an open note exactly as `commit` is —
   you asked for something, so it cannot also be finished.
3. **This overturns a Non-goal, deliberately.** `feat-review-verdict` ruled out
   chaining: *"'Commit what I just read' and 'go build the next thing unattended'
   are different sizes of decision."* That conflated two meanings of unattended —
   nobody choosing, and nobody watching. A distinctly-labelled fourth button is
   chosen, deliberately, by the person who just read the diff. The reasoning
   banned an automatic chain and caught a chosen one by accident.
4. **`continue` stops at `/spec-next`, and never at `/spec-complete`.** On the
   last phase it says there is nothing left and stops. Completing lands the
   branch and tears the worktree down, which must not fall out of a button
   labelled *continue*.
5. **`discuss` survives, and means "ask me what's up".** Not "report the notes
   and wait" — an opening move rather than a stopping place. It is also what an
   **absent** verdict means (`feat-review-verdict` Decision 2), so the verdict is
   load-bearing for compatibility even though the button is a convenience.
6. **`review.commitWith: "none"` is removed.** It exists only to produce the
   record-and-do-nothing state this spec is about, and the labels here would make
   it a lie. The key keeps its real job — *which* skill commits.
   *(The one call made without the operator answering; easy to reverse, and
   `none` shipped hours ago so nothing can depend on it.)*
7. **Approving someone else's work is a different mechanism, not this one.**
   Recording "I approve, the originator may proceed" is a real need and a
   separate design — with its own rule that only the originator actions the
   current version. Folding it in here is what made `none` look reasonable.
   Out of scope, deliberately, and named so it is not re-derived.

## Solution overview

```
     ┌─ Your verdict ─────────────────┐
     │ [ ✓ Commit ]                   │   both blocked while a note is open
     │ [ ✓ Commit & Continue ]        │
     │ [ ↺ Request changes ]          │
     │ [ … Discuss first ]            │
     └────────────────────────────────┘

  commit           ▶ review.commitWith           ▶ stop
  commit-continue  ▶ review.commitWith ▶ /spec-next
                                       ▶ last phase? say so, stop
  changes          ▶ work the commented files
  discuss          ▶ ask what's up            (also: no verdict at all)
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Engine | update | `VERDICTS` — `approve`→`commit`, add `commit-continue`; read legacy `approve` |
| Engine | update | `judgeVerdict` blocks `commit-continue` on an open note, as `commit` |
| CLI output | update | the verdict line and `--json` say the new words |
| Config key | remove | `review.commitWith: "none"` |
| Page | update | four buttons, labelled for what they do |
| Skill | update | `/spec-diff` routes the fourth verdict; `discuss` opens a conversation |
| Rule/docs | update | `spec-planning.md`, the CLAUDE.md section, `env.config.md`, the docs site |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The vocabulary in the engine | ✅ | [01-vocabulary.md](01-vocabulary.md) |
| 2 | The page's four buttons | ✅ | [02-four-buttons.md](02-four-buttons.md) |
| 3 | Routing, and the words | ✅ | [03-routing-and-words.md](03-routing-and-words.md) |

## Non-goals

- **Approving someone else's work.** Decision 7 — a separate mechanism, whose
  central rule is that only the originator actions the current version.
- **Chaining past `/spec-next`.** Decision 4. `continue` builds the next phase
  and stops; it never completes, lands or tears anything down.
- **Automatic chaining.** The Non-goal this spec overturns was right about that
  much: nothing chains unless a person pressed the button that says it will.

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-14 | Ready | backlog | Reuben Greaves |
| 2026-09-14 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-14 — Phase 3: `/spec-reviewed` **had landed**, so the routing was
  pointed at `/spec-diff` §2a from there rather than written twice — with one
  sentence carried across deliberately, that `commit-continue` stops at
  `/spec-next`. A pointer is right for the routing; the thing a reader must know
  *before* invoking anything is worth saying where they are.
- 2026-09-14 — Phase 3: `discuss` was reworded from "report and wait" to
  **"ask me what's up"**, and the wording has to work for a pass that chose
  nothing — an absent verdict means this too. So it asks about the **review**,
  never about the button, which is the sentence a later edit would most easily
  lose.
- 2026-09-14 — Phase 2: the page names its committing pair **once**, as
  `COMMITTERS`, mirroring the engine's `COMMITTING` — and a test asserts the old
  per-button form is *gone* rather than merely unused. Two committing controls
  read separately is precisely how a page ends up with one disabled and the
  other not, which would be a way around the single refusal it makes.
- 2026-09-14 — Phase 2: the gap phase 1 opened deliberately is now closed, so
  the page-suite test that pinned it moved back to asserting page and engine
  agree. The tolerance for an older page's `approve` stays tested in
  `env-review-verdict.test.js`, where it belongs — it is about a stale tab, not
  about what this page sends.
- 2026-09-14 — Phase 1: the tolerance turned out to be needed at **four** reads,
  not one. The plan named the stored outcome log; in fact `approve` can arrive
  from a page that has not been reloaded (so `validateNotesBlob` reads through
  it **before** checking, or a stale tab would land a rejected review instead of
  a committed one), out of the holding area when a waiting pass is described,
  and at `judgeVerdict`. One `readVerdict` at each, rather than a migration
  nobody would run against gitignored files.
- 2026-09-14 — Phase 1: the block is keyed off a **`COMMITTING` list**, not a
  second `if`. A fourth verdict is exactly how a page gains a way around the one
  refusal this engine makes; adding a committing verdict now means adding it to
  that list, and the block follows for free.
- 2026-09-14 — Phase 1: **sixteen existing tests went red on the rename**, which
  is the point of confining this phase to the engine. Each was a real assertion
  about the old vocabulary rather than noise — including one on the page suite
  that now pins the gap deliberately: the page still sends `approve` until phase
  2 relabels it, and the engine reads it as `commit`.
- 2026-09-14 — Spec created, from the operator's argument that a review is the
  guard before an action and so the verdict should name the action. That killed
  an objection of mine in passing: I had defended `commitWith: "none"` as a
  legitimate config, and it is in fact the thing that produces the do-nothing
  approve. **Depends on `feat-spec-reviewed`** for where a claimed verdict gets
  routed — build that first, or phase 3 covers `/spec-diff` alone and
  `/spec-reviewed` inherits the routing when it lands.
