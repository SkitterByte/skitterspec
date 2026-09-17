---
linear_identifier: "SKS-324"
linear_url: "https://linear.app/skitterbyte/issue/SKS-324/put-it-live-from-the-review-page"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Put it live from the review page

> **Type:** Feature
> **Name:** feat-put-it-live-from-the-page (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-17)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-17
> **Area:** packages/common/src/env/review.js, packages/common/src/env/live.js, packages/common/src/env/serve.js, packages/common/src/cli.js, packages/common/assets/review/page.html, packages/common/assets/skills/spec-diff/SKILL.md, packages/common/assets/rules/spec-reports.md
> **Stack:** worktree

## Problem

The review page shows you the diff and asks for a verdict on it. Reading a diff
is not the only way to judge a change — often the question is *does it actually
work* — and the answer to that lives at the running URL, which the page cannot
reach. So the reader leaves the page, goes back to a terminal, types
`/spec-live <spec>`, looks, comes back, and finds the page they left. The
mechanism exists and is one command; the loop the review page was built to close
is open again at exactly the point where seeing it run would change the verdict.

Worse, that trip is the one the reader on a phone cannot make at all. The three
tier links got the page to them; nothing gets them the running app.

## Decisions

1. **One line, above the verdicts, naming the state and the one action that
   changes it.** `live: off ▶ Put it live` · `live: on ■ Take it down`. It reads
   first because whether to look at it running is decided *before* concluding,
   not after — and it is visually separate from the verdict row, because it is
   not a verdict.
2. **It is an action, not a verdict — and that distinction is the spec.** A
   verdict is a conclusion, consumed once by the thing it asked for. This
   changes what is *running* and then puts the reader back where they were, so
   it never joins `VERDICTS` or `COMMITTING`, and it is **structurally incapable
   of clearing an armed gate**: a phase that ended still owes a verdict
   afterwards. Rejected making it a seventh verdict — the outcome log would then
   record a conclusion nobody reached.
3. **A press commits first, then takes.** `live take` refuses a dirty worktree
   (`live.js` guard 3b), and even without that guard uncommitted work stays in
   the worktree — so what went live would be the *previous* commit while the
   page claimed otherwise. A phase-end render is always uncommitted, so the
   press hands off to `review.commitWith` (`/commit`), then takes the instance,
   then re-renders `--branch` and waits again. The commit is the mechanical
   precondition, **not** the reader's verdict, so the gate stays armed.
   Rejected greying the line while dirty: that is almost every phase end, which
   is the case the feature exists for.
4. **After the commit the committing verdicts still mean what they say.** The
   phase has landed, so `Commit` commits nothing and means *approved* — and it
   stays in `COMMITTING`, which is what lets it clear the gate. Rejected
   re-rendering with `midrun` buttons: `continue` is deliberately outside
   `COMMITTING` and could never discharge the gate, so the reader would be left
   owing a verdict no button on the page could give.
5. **A page press authorises the engine to act.** `/spec-live`'s
   `disable-model-invocation` exists so no model turn is spent finding a
   one-verb command — unlike `/spec-reviewed`, where the marking is the
   enforcement of a rule. A press is a human act. Every refusal the engine
   already makes is relayed **verbatim and never worked around**: the workbench
   held by another spec, a hotfix, a stateful spec, a branch touching
   migrations, no dev server listening.
6. **Worktree views only.** `--docs` pages (`/spec`, `/spec-review`) have no
   branch to put live, so the `authoring` and `refresh` sets show no line at
   all — an absence, not a greyed control.
7. **A mid-phase render shows the state but will not commit for it.** On
   `midrun` with a dirty tree the line says the phase must land first.
   Committing half a phase to look at it splits a phase across two commits and
   leaves a mess the reader did not ask for; at a phase end the commit is the
   commit that was going to happen anyway.
8. **While a spec is live, the render reads the primary checkout.** `take`
   detaches the worktree and checks the branch out in the primary checkout, so a
   render still reading `git -C <worktree>` would show the wrong tree — or
   nothing. `viewFor` gains that case.
9. **The action is recorded as an action.** It appends to the sidecar's
   `decisions` log as `{action: 'live-on'|'live-off'}` rather than
   `{verdict: …}`, so the history shows what the engine did on your behalf while
   nothing can mistake it for a conclusion.
10. **The banner gains one line.** `spec-reports.md` is deliberately rigid about
    the banner, so this is an amendment with its reason recorded beside the
    others: a reader deciding whether to open the page wants to know whether it
    is already running somewhere, and that is one line rather than a trip.

## Solution overview

The engine learns to answer *is this spec live* in a form a page can carry, the
page grows one labelled line above the verdicts, and the press routes through
`/spec-diff` the way a verdict does — except that it loops back to the page
instead of ending there.

```
live: off        ▶ Put it live
live: on         ■ Take it down        (running at http://localhost:3000)
live: held       feat-auth holds the workbench — /spec-complete or /spec-live main
live: n/a        (no line at all — a --docs page, or no worktree)
```

The press sequence, and what each step is for:

```
▶ Put it live   → /commit            the phase lands (precondition, not a verdict)
                → live take <spec>   branch into the primary checkout
                → review --branch    re-render what is now committed
                → review wait        hold again, gate still armed

■ Take it down  → live release       branch back to its worktree
                → review             re-render, hold again
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-env live status --json` |
| CLI command | update | the render carries `live` in text and `--json` |
| Domain object | add | `liveStateFor(spec)` → `on` · `off` · `held` · `unavailable` |
| Domain object | update | `viewFor` reads the primary checkout while a spec is live |
| Domain object | update | the pass blob accepts `action`, alongside `verdict` |
| Route/UI | add | one live line above the verdict row, `committing`/`midrun` only |
| Skill/rule | update | `/spec-diff` §2 routes the action; `spec-reports.md` banner gains `live:` |
| Business rule | add | an action never enters `VERDICTS`/`COMMITTING` and never clears the gate |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The engine knows whether it is live | ⬜ | [01-the-engine-knows.md](01-the-engine-knows.md) |
| 2 | The page's line, and the action behind it | ⬜ | [02-the-line.md](02-the-line.md) |
| 3 | The skills route it, the rule holds the shape | ⬜ | [03-routing-and-the-rule.md](03-routing-and-the-rule.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-17 | Ready | backlog | Reuben Greaves |
| 2026-09-17 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-17 — Spec created. Grilled out four decisions the shape turned on: the
  dirty-worktree collision (commit first, since a phase end is always dirty),
  the line's placement (above the verdicts, because the question comes before
  the conclusion), whether a press may act (yes — `/spec-live`'s user-only
  marking is ergonomics, not enforcement), and whether the banner carries the
  state (one line, amended with its reason).
