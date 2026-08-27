# Phase 1 — Claim subtree bullets in the parser ⬜

> **Status:** Not started

**Goal:** `findTaskBlocks` stops abandoning lines. Every line inside a task's
list subtree belongs to some block, and a bullet that is not a checkbox is
flagged as such rather than silently discarded.

## Tasks

- [ ] RED — add `packages/sync-core/test/sync-task-subtree.test.js` with the
      reported shape at hanging indents **2, 4 and 6**: a parent task, a nested
      checkbox with its own wrapped continuation, then a non-checkbox sibling
      bullet with its own wrapped line. Assert every source line index is claimed
      by exactly one block.
- [ ] Add a fixture for the plain-bullet-then-deeper-checkbox order, so a
      checkbox after a plain bullet still starts its own block.
- [ ] Track the enclosing task's marker indent in the `findTaskBlocks` scan (the
      subtree root), alongside the existing hanging indent.
- [ ] When the continuation loop breaks on a bare list marker (`task-block.js:143`)
      and the line is deeper than the enclosing task's marker indent, start a
      **non-checkbox block** at it: `{ checkbox: false, mark: null }`, `indent`
      from the line, `text` via `collapseHyphenAware`.
- [ ] A non-checkbox block absorbs its own wrapped continuations under the same
      rules a task does (its hang is its marker width).
- [ ] Set `checkbox: true` on every existing task block so callers can branch on
      one field rather than sniffing `mark`.
- [ ] A bullet at or shallower than the enclosing task's marker indent stays
      unclaimed (Decision 4) — assert this, so the projection does not widen to
      the whole phase body.
- [ ] GREEN — new tests pass; `node --test packages/sync-core` fully green
      (existing block consumers still see the same task blocks).
