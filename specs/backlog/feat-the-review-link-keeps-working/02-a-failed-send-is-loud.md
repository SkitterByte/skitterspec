# Phase 2 — A failed send is as loud as a successful one ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the one outcome a reader must act on stops being reported more quietly
than the one they need do nothing about.

## Tasks

- [ ] Move the send's failure paths out of `copy-hint` — a small grey line in the
      footer, under a verdict bar that has just closed — and into the decided
      panel's callout, the box the unclaimed-pass case already uses.
- [ ] Style the failure variant from `--del-bg` / `--del-fg` / `--del-mark`, the
      delete palette. Those three are already defined on bare `:root` and
      redefined in both theme blocks, which is the property `assets-review`
      guards; mint no new tokens.
- [ ] **Name the cases separately**, because they send the reader to different
      places:
      - `404` — this page's server is not there any more (it moved, or another
        repo holds the port). Re-open the page.
      - `422` — the engine read the pass and refused it. Relay its message
        verbatim; it names the entry that was wrong, and re-opening would only
        refuse again.
      - a rejected request — the network, or the server is down. Re-open, or use
        the command.
- [ ] Offer the `/spec-reviewed <verdict>` command in the box, with its Copy
      control. It reaches the agent regardless of any server, which is the only
      reason a recovery can be offered here at all — and it is the same control
      the `file://` page already uses, so there is one command row, not two.
- [ ] **Do not mark the page decided on a failure.** Nothing was delivered, so
      the verdict buttons stay live and the reader can try again after re-opening
      — a page that closed its controls over a failed send would strand them.
- [ ] Keep the clipboard blob path for a pass carrying marks: a command cannot
      carry notes, and a failed send must not become the moment they are dropped.
- [ ] Tests: a `404` says the server is gone and offers the command; a `422`
      relays the engine's own words and does **not** tell them to re-open; a
      rejected fetch is distinguishable from both; the buttons stay enabled
      through all three; a marked pass still falls back to the blob.
- [ ] Stays-silent test: a **successful** send is untouched — same callout, same
      green, same polling, same wording.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

The failure text is the engine's where there is one (`422`) and the page's where
there is not (`404`, a rejected request). Paraphrasing the engine's message is
how a reader ends up hunting for a problem the tool had already named.
