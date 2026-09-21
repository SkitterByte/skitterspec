# Phase 1 — The `fix` set exists, and survives a served re-render ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `--buttons fix` renders a page offering `Commit`, `Request changes`
and `Discuss` — and a page the daemon re-renders offers the same three, proven
by a test that serves one.

## Tasks

- [ ] Add `fix` to `BUTTON_SETS` in `packages/common/src/env/review.js`.
- [ ] Add `fix: ['commit', 'changes', 'discuss']` to the `OFFERS` table in
      `packages/common/assets/review/page.html`. Keep it a table entry — the
      comment above it records why a chain of ternaries is not allowed here.
- [ ] Add `fix` to `NARROWING_SETS` in `packages/common/src/env/serve.js`, and
      extend the comment block above it: the record answers *whether the run had
      finished*, and `fix` answers a third thing that no tree can show — whether
      the work was ever phased.
- [ ] Test: a `--buttons fix` render offers exactly those three, and hides
      `commit-continue` and `commit-start`. Drive the page through the DOM shim
      in `packages/common/test/assets-review.test.js`, so the assertion is on
      what a reader can press rather than on markup.
- [ ] Test: the served page keeps `fix`. Extend
      `packages/common/test/env-serve-buttons.test.js` — a spec whose record says
      `fix`, re-rendered through `renderSpecPage`, must not fall through to
      `committing`. This is the regression the whole phase turns on.
- [ ] Test (stays silent): a record saying `fix` for a spec whose tree is
      `nospec` or `authoring` still narrows rather than widens — no verdict
      appears that the tree's family would not have offered.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

`NARROWING_SETS` is the half that is easy to miss and expensive to miss: without
it the CLI render is right and every refresh of the same URL is wrong, which is
the harder bug to see because the first page anyone opens looks correct.
