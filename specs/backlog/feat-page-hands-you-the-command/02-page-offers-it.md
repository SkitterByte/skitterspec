---
linear_issue_id: "SKS-243"
---

# Phase 2 — The page offers the command ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** after sending, the page hands over `/spec-reviewed <code>` — one tap
where the clipboard is available, and pre-selected text where it is not, which
is the usual case.

## Tasks

- [ ] Show the whole command where the "Sent" hint already is, and make it the
      thing the reader acts on. Not a second bar: that is where their eye is at
      the moment they need it.
- [ ] Offer **Copy** when `navigator.clipboard.writeText` exists, reusing the
      page's existing clipboard path rather than a second implementation.
- [ ] **Fall back to pre-selected text when it does not** — the usual case on a
      LAN-served page, because the clipboard API is secure-context-only and
      `http://<lan-ip>:7777` is not one. Select it so a copy is one gesture, and
      say it is selected rather than leaving the reader to guess why nothing
      happened.
- [ ] **Never show a Copy button that cannot copy.** Decide from
      `navigator.clipboard` being present, not from trying and failing — a
      button that does nothing on tap is worse than text that was always text.
- [ ] Keep the `file://` path exactly as it is: no server, no code, no command —
      it copies the blob and the operator pastes it, which is the whole story for
      a local reader.
- [ ] Tests, driving the real page as `assets-review.test.js` establishes: with a
      clipboard, the command reaches it verbatim and includes the code; with none,
      the command is shown and selected; the `file://` path is untouched; no Copy
      control appears when the API is absent.
- [ ] **Stays silent:** a page that sent nothing shows no command, and the
      existing hints are unchanged.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

The shim will need `navigator.clipboard` to be **absent** in one test and present
in another — it already takes a `clipboard: false` option for exactly this, since
the `file://` case needed it. Reuse that rather than adding a second switch.
