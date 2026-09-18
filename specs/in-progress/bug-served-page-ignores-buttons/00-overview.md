---
linear_identifier: "SKS-357"
linear_url: "https://linear.app/skitterbyte/issue/SKS-357/bug-the-served-page-ignores-the-button-set-it-was-rendered-with"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: the served page ignores the button set it was rendered with

> **Type:** Bug
> **Name:** bug-served-page-ignores-buttons
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-18
> **Area:** `packages/common/src/env/serve.js`, `packages/common/src/env/review.js`, `packages/common/src/cli.js`

## Symptom

A `/no-spec` branch renders its page with `--buttons nospec`, which offers
`Commit & Land` and `Commit`. Opened over http from the review daemon, the same
page offers `Commit & Continue` and `Commit & Start` instead — the committing
set. Pressing one returns a verdict the skill that rendered the page cannot act
on: `commit-continue` names a next phase a specless branch does not have, and
`commit-start` would put a spec in flight that does not exist.

Observed on `docs-catch-up`: the page was rendered `--buttons nospec`, the
served page's data island reported `buttons: None`, and the pass that came back
carried `commit-continue`. The reader pressed the button they were shown; the
page was wrong, not the press.

This is the third bug in one family. `bug-no-spec-page-404s` made specless
pages reachable; this one makes the reachable page offer the right verdicts.

## Root cause

`renderSpecPage` (`packages/common/src/env/serve.js:375`) took `{ branch }` and
no button set at all. Of its three `collectReview` calls, the docs path
hard-coded `buttons: 'authoring'` and the other two passed nothing — and
`collectReview` writes the key out only when it differs from the default
(`packages/common/src/env/review.js:389`), so an omission is indistinguishable
on the page from a deliberate `committing`. The page's own JS then reads
`OFFERS[data.buttons] || OFFERS.committing` (`assets/review/page.html:1629`),
which is why every served page that was not a docs view offered the committing
pair regardless of what rendered it.

The daemon re-renders per request and is **not** the caller, so it never had the
declaration to pass on. `BUTTON_SETS`' own doc says the set is declared by the
caller and never derived — correctly, but it left the one consumer that has no
caller with nothing to read.

The branch-fallback call is the same omission on the path that fires **most**: a
phase ends with the page rendered and the commit landing straight after, so from
then on the working view is empty and every render of that spec falls back.

## Failing test (red)

`packages/common/test/env-serve-buttons.test.js`, run with
`node --test packages/common/test/env-serve-buttons.test.js`.

```
✖ a specless branch is served the nospec buttons
  + actual - expected
  + 'committing'
  - 'nospec'
```

Twelve of its fourteen tests were red; the two green ones were the two families
the old code happened to get right (`authoring` for a docs view, `committing`
for a phase), which is what proves the fixture was not simply broken.

## Fix

Two sources, each answering only what it knows.

- [x] `buttonsForView(viewKind, spec, recorded)` in `serve.js` — **the tree
      answers the family**: a docs view is `authoring`, `spec.specless` is
      `nospec`, anything else is `committing`. The tree is now, where a record
      is as old as the last render.
- [x] `.render.json` beside the page — **the record answers whether the run had
      finished**, which no tree can show. `readRenderRecord`/`writeRenderRecord`
      in `review.js`, written by the CLI render beside `writeReviewPage`,
      best-effort.
- [x] The record **narrows only**: `midrun` and `refresh` are taken from it and
      nothing else is. A stale record costs a reader `Continue` where `Commit`
      was available — one refresh away — and can never hand a specless branch a
      `Commit & Start`.
- [x] All three of `renderSpecPage`'s `collectReview` calls pass the set,
      including the branch fallback.
- [x] A call-site scan pins that a fourth cannot be added without one.
- [x] Failing tests now pass (GREEN); full suite green — 3369 passed.

One test elsewhere had to be narrowed rather than the fix changed:
`env-review-reader.test.js`'s publishing prohibition asserted an exact file list
where its claim was about the two suffixes publishing leaves behind, so an
ordinary new gitignored sidecar turned it red while the thing it names went on
holding.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Artefact | add | `.spec-env/reviews/<spec>.render.json` (gitignored) |
| Engine | update | `serve.js` `buttonsForView`, `renderSpecPage` |
| Engine | update | `review.js` `readRenderRecord` · `writeRenderRecord` |
| CLI command | update | `spec-env review` records the set it rendered with |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-18 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-18 — Bug reproduced; failing test added (red).
- 2026-09-18 — Fixed. Found a fourth call site while fixing: the branch
  fallback dropped the set too, which is the path a spec spends most of its life
  on.
