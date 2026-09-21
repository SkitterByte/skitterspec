# Phase 1 — Highlight the current file in the tree as you scroll ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the sidebar marks the file whose card is at the top of the viewport,
and scrolls itself when that row would otherwise be out of sight — proven by
driving the observer callback in the test shim and asserting which row carries
`is-current`.

## Tasks

- [ ] Add `.tree-file.is-current` CSS: a left accent bar (`box-shadow: inset
      3px 0 0 var(--accent)` or an equivalent that does not shift the row's
      layout) and `.nm` in `var(--accent)`. It must stay distinguishable from
      `.tree-file:hover`, which owns the `--panel-2` background.
- [ ] Keep the row's existing `background: var(--panel)` intact — `.ct`
      inherits it to mask names scrolling underneath, so `is-current` must not
      make the pinned counts transparent.
- [ ] Hold a `path → tree row button` map when `renderTree` builds the list, so
      marking a row is a lookup rather than a DOM query per scroll event.
- [ ] Add `setCurrent(path)`: clear `is-current` from the previously marked row,
      set it on the new one, remember it. A no-op when the path is already
      current.
- [ ] Build the observer behind `typeof IntersectionObserver === 'function'`,
      mirroring the `ResizeObserver` guard at `page.html:1229` — a browser
      without it keeps a page with no highlight and no error.
- [ ] Observe every per-file `<details>` as it is created, with a `rootMargin`
      that weights a band near the top of the viewport. Track the intersecting
      set and pick the topmost by document order.
- [ ] Do nothing when the set empties — the last current row stays lit
      (Decision 5). Clear it explicitly when the page becomes decided, since
      the diff is hidden and no card can qualify.
- [ ] Follow only when off-screen: compare the marked row's offset against the
      tree scrollport's scroll window, and call `scrollIntoView({ block:
      'nearest' })` only when it falls outside.
- [ ] Reuse the highlight for `reveal()` and `gotoLine()` so a clicked or
      jumped-to file is marked immediately rather than waiting for the scroll
      to settle.
- [ ] Add an `IntersectionObserver` stub to the test shim in
      `assets-review.test.js`: record observed nodes, expose a way to fire the
      callback with a chosen set of entries.
- [ ] Test: firing the observer with two files intersecting marks the one
      earlier in document order, and only that one.
- [ ] Test: a second fire moves the class — exactly one row carries
      `is-current` at any time.
- [ ] Test (stays silent): a shim with **no** `IntersectionObserver` renders the
      page, builds the tree, and marks nothing — no throw, no class, per
      `.claude/rules/negative-checks.md` rule 3.
- [ ] Test (stays silent): firing the observer with an empty entry set leaves
      the previously marked row exactly as it was.
- [ ] Run `node --test` from the repo root — green before the phase is done.

## Notes

The tree is one flat `<ul>` indented by per-row padding, not nested lists — see
the comment above `renderTree`. The accent bar therefore sits on a row that
spans the full scroll width, so an `inset` shadow lands at the scrollport's left
edge rather than at the row's indent. That is the intended look: the bar marks
the row, not the nesting level.

On narrow screens the tree is a collapsed `<details>` and not sticky. The
observer still runs and the class is still set — a reader who opens the tree
mid-scroll finds it already correct, and `scrollIntoView` inside a closed
`<details>` is a no-op.
