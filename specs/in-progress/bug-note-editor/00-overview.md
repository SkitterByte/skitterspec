---
linear_identifier: "SKS-378"
linear_url: "https://linear.app/skitterbyte/issue/SKS-378/bug-the-review-pages-note-editor-loses-what-you-type"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: the review page's note editor loses what you type

> **Type:** Bug
> **Name:** bug-note-editor (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixed (tests green)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-21
> **Area:** `packages/common/assets/review/page.html` (note rows, verdict bar) ·
> `packages/common/test/assets-review.test.js` (the DOM shim)

## Symptom

Two ways a note written on the review page does not survive.

**It is sized by the file, not by the pane.** Opening a note on a line puts a
textarea as wide as the diff table rather than as wide as what you can see. On a
file with long lines that is several screens wide, so typing runs off to the
right and the box scrolls sideways instead of wrapping. Reproduced against the
shipped stylesheet in headless Chrome: a 1112px pane, a file whose longest line
is 4,900px, and a `.note-input` measured at **4,927px**.

**It is discarded without a word.** Text typed into the editor is not a note
until `Add note` is pressed. Press a verdict instead and the page closes into its
decided state, taking the editor with it — the text is gone, the pass does not
contain it, and nothing said so.

## Root cause

**The width.** `.note-input` is `width: 100%`
(`packages/common/assets/review/page.html:424`) inside `td.src` of a note row,
and that cell is a column of `table.diff`. The column's width is the widest
`td.src` in the file, and `td.src` is `white-space: pre` (`:276`) — so it is the
longest line of source, whatever that happens to be. The note inherits the
file's width where it wanted the pane's. It technically wraps; it wraps four
screens to the right.

**The loss.** `noteEditor` (`:1206`) reads its textarea only inside the `Add
note` handler — typing into the box changes no state at all. The verdict click
handler (`:2784`) goes straight to `send(verdict)`, `send` builds the blob from
`st.drafts`, and `drawDecided` then tears the diff down. Nothing between the
keystroke and the teardown ever looks at the box.

## Failing tests (red)

`packages/common/test/assets-review.test.js` — nine, under
*a note survives being written*. Run with
`node --test packages/common/test/assets-review.test.js`.

Width: the `.note-body` rule and its bindings; the stored note and the draft both
sitting in one; the pane width being published on render; and the stays-silent
case — a file measured at 0 (a `<details>` never opened) publishes nothing rather
than a 0px pane.

Loss: a verdict over an unadded note warns and sends nothing; the same verdict
again sends; adding the note clears the warning; text written *after* a warning
warns again rather than riding the old confirmation out; and the stays-silent
case — an editor holding only whitespace is not warned about.

```
✖ a note body is pinned beside the gutter and takes the pane width
  the template defines .note-body
✖ a verdict pressed over an unadded note warns, and sends nothing
  Cannot read properties of undefined (reading 'hidden')
```

## Fix

- [x] Wrap a note row's contents in `.note-body` — the stored note, the
      resolution, the draft editor and its actions.
- [x] Bind that body to the pane: `position: sticky` at `left: var(--gutter-w)`,
      `width: var(--pane-w)`, `max-width: 100%` so it can never widen the table.
- [x] Publish `--gutter-w` and `--pane-w` on each `.code` box from a measurement,
      not from arithmetic over `--ln-w` — `td.gutter` is one sticky cell
      precisely so nobody has to do that sum. Re-measure on resize where the
      browser has a `ResizeObserver`.
- [x] Warn on a verdict pressed over an editor holding text: name what would be
      lost and the button pressed, send nothing, and reveal the editor. The same
      press again sends.
- [x] Teach the test shim the two things the page now touches — `style` and
      element widths — as declared values, since a shim cannot lay out.
- [x] Nine failing tests now pass (GREEN); full suite green.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Review page | update | note rows gain `.note-body`; `.code` carries `--pane-w`/`--gutter-w` |
| Review page | add | `#verdict-warn` — the unsent-text warning |
| Test shim | add | `node.style`, declared element widths, `runPage({ widths })` |

The pass blob, the verdict vocabulary and the engine are untouched: the warning
lives entirely in the page, and a confirmed press sends exactly the pass it
always did.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-21 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-21 — Bug reproduced; nine failing tests added (red). The width half was
  reproduced in headless Chrome against the shipped stylesheet before a line was
  changed, which is what turned "the box keeps growing" into a measurement.
- 2026-09-21 — Rejected: auto-adding the unfinished text as a note. It would turn
  stray typing into a request, and for a committing verdict that request would
  then block the very commit the reader just asked for.
- 2026-09-21 — Rejected: refusing the verdict outright. This page makes one
  refusal deliberately (an open note blocks a commit) and must not grow a second
  — discarding half a sentence is often exactly what the reader means. Warned,
  then sent on the same press again.
- 2026-09-21 — Rejected: a fixed prose measure (`width: min(72ch, 100%)`),
  which needs no JS. It leaves the note anchored off-screen for a reader who has
  scrolled right, and deriving the gutter offset in CSS re-introduces the
  left-offset arithmetic `td.gutter` exists to avoid.
- 2026-09-21 — Fixed: the note body takes the pane's width and follows the
  horizontal scroll; a verdict over unadded text warns once and sends on the
  next press. 3,485 tests green. Re-measured in headless Chrome against the
  shipped stylesheet: the same note that was 4,927px is 1,069px, wraps in view,
  and stays visible with the pane scrolled 2,500px right — and the table is
  narrower than before, since the note no longer widens it.
