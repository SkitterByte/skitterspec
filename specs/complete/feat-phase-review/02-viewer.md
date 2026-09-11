---
linear_issue_id: "SKS-140"
---

# Phase 2 — the viewer: context bands, file tree, both themes ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the emitted page is a review surface rather than a coloured dump —
expandable context, a file tree, a noise filter, and it reads correctly on a
phone in light and dark.

## Tasks

- [x] Move the prototype's template into `packages/common/assets/review/` as a
      shipped asset with two placeholders — the data island and the review block
      — so the engine splices rather than generates. Register it with the install
      manifest like any other asset.
- [x] Collapse unchanged runs to four lines either side of a change, with a band
      showing the hidden count and controls to expand **±20** or **all**, plus a
      page-level "show all context". Re-render the file on expand; do not
      pre-render thousands of hidden rows.
- [x] Build the file tree from the paths: nested folders, `+/−` per file, tap to
      open and scroll to that file — including files hidden by the noise filter,
      so nothing in the tree is unreachable.
- [x] Keep line numbers sticky on horizontal scroll, and give the code container
      its own `overflow-x: auto` so the page body never scrolls sideways.
- [x] Implement all three theme states per the repo's own artifact rules: a full
      light palette on bare `:root`, a dark override guarded
      `:root:not([data-theme="light"])`, and `:root[data-theme="dark"]`. Every
      colour comes from a token; `body` paints an explicit background.
- [x] Make add/remove legible **without** relying on colour alone (the `+`/`−`
      gutter stays), and give every control a visible focus state.
- [x] Add `packages/common/test/assets-review.test.js`: the template ships with
      both placeholders and no external `src`/`href` beyond fonts; every colour
      token used is defined in the bare `:root` block (the classic
      unreadable-in-one-theme bug); and the JSON island escaping survives a patch
      containing `</script>`.
- [x] Run `pnpm test` in `packages/common` and at the repo root — green before
      the phase is done.

## Notes

The prototype is the design reference and has been through one round of feedback
already: context expansion and the tree came out of it. Its remaining rough edge
is that bands are keyed by index, so expanding is stateful per file — keep that
state in the page, never in the emitted data.

Resist adding syntax highlighting in this phase. It needs a tokeniser per
language, it is the largest thing that could arrive next, and the review is
legible without it.
