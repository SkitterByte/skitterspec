---
linear_issue_id: "SKS-239"
---

# Phase 2 — The button reasons from it ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `✓ Commit & Continue` is disabled, with its reason on the label, when
there is no phase for it to continue into — and unchanged when there is, or when
the engine could not tell.

## Tasks

- [ ] Disable `✓ Commit & Continue` when `data.phases` says `hasNextPhase` is
      false, labelling it **`✓ Commit & Continue — no phase left`**. The reason
      goes ON the control, exactly as the open-note block puts it there: a button
      merely dimmed reads as a broken page, and a tooltip is unreachable on a
      phone.
- [ ] **Leave it enabled when the engine could not tell** — no `phases` key at
      all. An absence is not evidence, and removing an offer that might work is
      worse than leaving one that might not (`negative-checks.md` rule 4).
- [ ] **The open-note block still wins.** A note open disables both committing
      buttons whatever else is true, and the label says the open-note reason —
      that is the refusal with teeth, and a "no phase left" label in its place
      would tell the reader the wrong thing to fix.
- [ ] Do **not** touch `✓ Commit`: a clean read still commits (Decision 4), and a
      completed spec is still a legitimate thing to read.
- [ ] Keep the page a **static artefact**: it reasons from the data it was
      spliced with and asks the filesystem nothing.
- [ ] Tests, driving the real page as `assets-review.test.js` establishes: the
      button is disabled and says why when no phase follows; enabled when one
      does; enabled when `phases` is absent; the open-note reason wins over the
      no-phase one when both apply; `✓ Commit` is unaffected in every case.
- [ ] **Stays silent:** a spec mid-flight with phases left renders exactly as it
      does today, and nothing about `changes` or `discuss` moves.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

The precedence test is the one worth writing carefully. Two reasons can be true
at once — a note is open *and* there is no phase left — and the label has room
for one. The open note is the one the reader can act on, so it wins; a page that
showed "no phase left" there would send someone to fix the wrong thing.
