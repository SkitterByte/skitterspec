# Bug: the review page's file list and its panes are in different orders

> **Type:** Bug
> **Name:** bug-review-file-order (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-09-22)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-22
> **Area:** `packages/common/assets/review/page.html`

## Symptom

On the review page, the sidebar file list and the diff panes on the right are
ordered independently. Scrolling the panes therefore walks the sidebar's
highlight up and down the list rather than down it — the current-file mark
"jumps around", which is what made the mismatch visible once the mark existed.

Repro: render any review whose files are not already in tree order — a change
touching two directories, or any review including an untracked file (git hands
those back as a separate run, so they land at the end of `data.files` whatever
their path). Open the page and scroll; the highlighted row moves backwards.

## Root cause

`page.html` derives the two columns from two different orderings of the same
list. The panes are built straight from `data.files` in emission order
(`var state = data.files.map(…)`, line ~1050, appended to `#files` in that
order), while `renderTree` imposes its own: directories before files at each
level, `Object.keys(n.dirs).sort()` for directories and `localeCompare` for
files (lines ~1720–1728). Neither is wrong on its own; nothing made them the
same order, so they agree only by luck. The emission order is git's — and
`review.js` pushes tracked changes and untracked files in two separate passes
(lines 295 and 301), so a new file is appended after everything else regardless
of its path.

## Failing test (red)

`packages/common/test/assets-review.test.js` → *"the tree decides the order the
files are shown in"*. It renders a deliberately scrambled five-file review
through the page script and asserts the panes' `data-path` sequence is tree
order, and that the sidebar's leaves match it pane for pane.

Run: `node --test packages/common/test/assets-review.test.js`

```
✖ the tree decides the order the files are shown in
  + actual - expected
  +   'README.md',
  -   'packages/a/y.js',
```

Its companion, *"an already-ordered review is left exactly as it came"*, is the
stays-silent case (`.claude/rules/negative-checks.md` rule 3): an ordinary
review must not be reshuffled by the fix.

## Fix

- [x] Sort the files into tree order **once**, before `state` is built, with a
      single comparator both columns then use — directories before files at
      each level, `localeCompare` within a level. Build the tree from the same
      ordered list, so the two orders are one order by construction rather than
      by agreement.
- [x] Failing test now passes (GREEN); run the project's typecheck and test
      commands — confirm no regressions.
- [x] None

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | update | `assets/review/page.html` — pane order follows the tree |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-22 | In Progress | in-progress | Reuben Greaves |
| 2026-09-22 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-22 — Bug reproduced; failing test added (red).
- 2026-09-22 — Fixed: one `treeOrder` comparator settles the order before
  `state` is built, and the tree is built from the same list; test green.
- 2026-09-22 — The shared test fixture's code file moved `src/app.js` →
  `lib/app.js`. It was listed ahead of `specs/…` in the emitted data but
  behind it in the tree, so once the panes followed the tree every
  `accepts(dom)[0]` in the file silently addressed the bookkeeping file. The
  rename makes the fixture's own two files agree, which is what those
  positional assertions were always assuming.
- 2026-09-22 — Completed; all phases done, tests green.
