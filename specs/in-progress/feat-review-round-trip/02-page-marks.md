---
linear_issue_id: "SKS-159"
---

# Phase 2 — Page marks, comments, check replies, copy-out ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the page can record a review pass — accept files, comment on lines,
answer the model's checks — and hand it to you as one clipboard blob the phase-1
engine ingests unchanged.

## Tasks

- [ ] Add a `[ ✓ accept ]` toggle to each file's summary row, plus the state
      chips: `accepted`, and `accepted earlier — changed since` for `'lapsed'`
      (Decision 3). Render from the data island's `accepted` field.
- [ ] Add a comment affordance in the line gutter that opens an inline note box
      anchored to that line, capturing `line` and `lineText`; and a file-level box
      from the summary row (`line: null`). Existing comments render in place,
      open ones marked and resolved ones struck through with their resolution.
- [ ] Add a reply box under each `flag`/`confirm`/`good` check in the review
      block; a reply becomes a comment carrying `check` (Decision 8). Give each
      check a stable id at render time so a reply can name it.
- [ ] Add `[ Copy review (N) ]` to the toolbar — N being pending marks. It builds
      the blob (`version`, `spec`, `generatedAt`, `accepted[{path,hash}]`,
      `comments[]`) and writes it with `navigator.clipboard.writeText`, falling
      back to a select-all textarea when the API is absent or throws. `file://` is
      not a secure context everywhere, so the fallback is a shipping requirement,
      not a nicety.
- [ ] Generate comment ids as `<generatedAt>-<n>` so they are stable per render
      and a re-paste merges rather than duplicates (Decision 5).
- [ ] Best-effort autosave to `localStorage`, keyed by spec + `generatedAt`, so a
      phone tab switch does not lose the pass. Every read and write is wrapped —
      Safari on `file://` throws rather than returning null, and a review page
      that fails to render because storage is disabled is a worse bug than a lost
      pass.
- [ ] Keep every new colour token defined on bare `:root` and only *redefined* in
      the theme blocks, per the existing rule at the top of the stylesheet.
- [ ] Extend `test/assets-review.test.js`: assert the page ships the new controls
      and ids, that the blob's `version` and key names match the engine's
      validator constants (one contract, linted in both directions), and that no
      new token gains its first definition inside a media or `[data-theme]` block.
- [ ] Add an engine-side round-trip test that ingests a committed
      **sample blob fixture** shaped exactly as the page emits, so phase 1's
      validator and the page cannot drift apart silently.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

The page stays a single self-contained shipped asset with inline vanilla JS — no
build step, no dependency, no framework. It is spliced into, never generated.
