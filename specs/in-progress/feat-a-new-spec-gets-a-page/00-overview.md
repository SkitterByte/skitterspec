---
linear_identifier: "SKS-300"
linear_url: "https://linear.app/skitterbyte/issue/SKS-300/a-new-spec-gets-a-page-and-the-page-commits-it"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# A new spec gets a page, and the page commits it

> **Type:** Feature
> **Name:** feat-a-new-spec-gets-a-page (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-16)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-16
> **Area:** packages/common/src/env/review.js, packages/common/src/cli.js, packages/common/assets/review/page.html, packages/common/assets/skills/spec/SKILL.md, packages/common/assets/skills/spec-review/SKILL.md
> **Stack:** worktree

## Problem

Every other point in the lifecycle ends on a page you can read and end in a
verdict. Authoring does not. `/spec` writes three or four markdown files, reports,
and stops — the spec is reviewed by scrolling the terminal, and it is left
uncommitted. The next command is `/spec-start`, which then has to point out that
the spec is not committed and commit it as a side effect of provisioning.

So the one artefact whose whole purpose is to be *read before work begins* is
the one artefact with no reading surface. `/spec-review` has the same gap for the
same reason: it edits spec documents in the primary checkout, where there is no
worktree, and `spec-env review` refuses without one (`cli.js:2046`).

The fix closes the loop the same way every other phase closes it — the button
carries the work on. `Commit & Start` does the `commit && /spec-start` that is
currently typed by hand, and `Commit` saves the spec for later.

## Decisions

1. **`commit-start` is its own verdict**, added to `VERDICTS` and `COMMITTING`
   beside `commit-continue`. Rejected reusing `commit-continue` with a
   context-dependent meaning: this design's rule is that
   *the verdict names the action*, and a word that means `/spec-start` on one
   page and `/spec-next` on another names neither — the outcome log would record
   the same word for two different things and a pass claimed an hour later could
   not say which.
2. **A third button set, `authoring`.** `BUTTON_SETS` is `committing`, `midrun`;
   this adds a set whose committing verdicts are `commit-start` and `commit`.
   An unknown `--buttons` value is already refused by name rather than coerced,
   so the new set inherits that.
3. **The file set comes from `spec-env stage`, not from the tree.** The page
   renders the `owned` paths that command already computes. This is load-bearing
   rather than tidy: the primary checkout holds whatever other sessions have
   written, and rendering the uncommitted tree would put a colleague's spec on
   your page and then commit it under your verdict. `stage` exists for exactly
   this split.
4. **The pass carries those paths**, so the commit hand-off to `review.commitWith`
   (`/commit` by default) gets an exact pathspec. A shared `.git/index` means the
   pathspec is what bounds the commit — see `.claude/rules/commit-messages.md`.
5. **Every `/spec` ends on the page and waits.** Not offered: the reports rule is
   that asking implies waiting, and an offer that finishes without watching is
   the shape that stranded ten passes. A `/spec` that wrote nothing (`⏸`, grilling
   unresolved) renders nothing and waits for nothing — there is no spec to show.
6. **It waits but arms nothing.** The review gate is armed by a *phase ending*
   and discharged by a committing verdict or a recorded skip. A backlog spec owes
   no phase, and walking away from it costs nothing — the spec is simply still
   uncommitted, which `/spec-start` already handles.
7. **`changes` works the notes, re-renders, and waits again.** The reader is
   still holding a decision, so dropping them back to the terminal to type
   `/spec-diff` would reopen the loop this spec closes. Each note is resolved, so
   the second render shows it struck through with what changed.
8. **`/spec-review` gets the page with no start verdict** — `commit`, `changes`,
   `discuss`. The spec it refreshed may already be in flight, so offering to
   start it would be wrong for half its inputs.
9. **Phase 1 does not relax the worktree gate.** It adds a mode that never
   consults it. `feat-stranded-pass-can-be-disowned` edits that same gate for
   `--drop`; keeping the two changes disjoint is what stops them conflicting, and
   either may land first.

## Solution overview

`spec-env review <spec> --docs` renders a spec's own documents from the tree the
command is run in, with the `authoring` button set. It resolves the spec's folder
but never its worktree; the files are `stage`'s `owned` list, diffed against
`HEAD` so a brand-new spec is a set of new files and a refreshed one is a patch.

`/spec` ends by rendering that page and waiting on `spec-env review wait`.
`commit-start` commits the owned paths and runs `/spec-start`; `commit` commits
and stops; `changes` edits the spec, resolves the notes, re-renders and waits
again; `discuss` reports. `/spec-review` does the same without `commit-start`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-env review <spec> --docs` (no worktree required) |
| Domain object | add | verdict `commit-start`; button set `authoring` |
| Route/UI | update | `page.html` renders the `authoring` verdict bar + its command list |
| Skill/rule | update | `/spec` ends on the page and waits; `/spec-review` likewise |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The engine renders a spec that has no worktree | ✅ | [01-a-spec-renders-without-a-worktree.md](01-a-spec-renders-without-a-worktree.md) |
| 2 | `/spec` ends on the page, and the button commits it | ✅ | [02-spec-ends-on-the-page.md](02-spec-ends-on-the-page.md) |
| 3 | `/spec-review` hands its refresh back the same way | ⬜ | [03-spec-review-hands-it-back.md](03-spec-review-hands-it-back.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-16 | Ready | backlog | Reuben Greaves |
| 2026-09-16 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-16 — Spec created. Raised from the loop where `/spec` finishes
  uncommitted and `/spec-start` has to say so.
- 2026-09-16 — Phase 1: the bookkeeping filter had to invert for the docs mode
  (`isNoise` folds `specs/` away, which rendered every file collapsed), and
  `verdictSaid` needed a `commit-start` case or an honoured one read as
  `discuss first`. `/spec-reviewed`'s verdict vocabulary gained the word, which
  a test driving off `VERDICTS` required.
- 2026-09-16 — Phase 2: the arming guard is anchored to a command line rather
  than a mention, because `doesNotMatch(/review arm/)` matched the skill's own
  prohibition. Set `review.reader: "remote"` in the project config out-of-band
  so renders serve an http page rather than a file:// one — not part of this
  spec, and uncommitted on `main`.
