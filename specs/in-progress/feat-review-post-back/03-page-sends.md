---
linear_issue_id: "SKS-220"
---

# Phase 3 — The page sends, and falls back ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** pressing a verdict on a served page sends it and shows the code;
pressing one on a `file://` page copies it exactly as it does today.

## Tasks

- [ ] Send on verdict: POST the blob to `location.pathname` — the page's own URL,
      so there is no second address to configure (Decision 8).
- [ ] Decide the path from what the page **is**, not from what it can guess:
      `location.protocol === 'file:'` is the clipboard case. Do not sniff for a
      server, and do not try the POST first and fall back on failure — a failed
      POST and an absent one look the same to the reader.
- [ ] Show the code where the verdict was pressed: `sent · claim it with 418207`,
      in the row the buttons are in, with the code selectable for anyone who
      would rather copy it than read it out.
- [ ] Keep the clipboard fallback intact for `file://` — same textarea, same
      hint, no deprecation notice (Decision 7).
- [ ] Report a refused POST on the page, with the engine's message. A pass the
      server rejected must not read as sent.
- [ ] Leave the marks in place after sending. A pass is not spent until it is
      claimed, so a page that cleared itself would be lying about state it does
      not own.
- [ ] Tests: driving the real page as `assets-review.test.js` establishes — a
      verdict POSTs when served and the body passes the **real** validator; the
      same verdict copies on `file://`; a refused POST is shown, not swallowed.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

The DOM shim has no `fetch` and no `location`; both want adding to it the way
`navigator.clipboard` already is — hand-rolled, in the test file, recording what
was sent so the assertion can be made against the real validator.
