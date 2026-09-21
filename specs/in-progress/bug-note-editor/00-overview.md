# Bug: the review page's note editor loses what you type

> **Type:** Bug
> **Name:** bug-note-editor (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — reproducing
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-21
> **Area:** `packages/common/assets/review/page.html` (review page — note rows, verdict bar)

## Symptom

Two ways a note written on the review page does not survive.

**It is sized by the file, not by the pane.** Opening a note on a line puts a
textarea as wide as the diff table rather than as wide as what you can see. On a
file with long lines that is several screens, so typing scrolls sideways instead
of wrapping.

**It is discarded without a word.** Text typed into the editor is not a note
until `Add note` is pressed. Press a verdict instead and the editor is torn down
with the page — the note is gone, and nothing said so.
