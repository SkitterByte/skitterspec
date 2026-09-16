---
linear_issue_id: "SKS-283"
---

# Phase 2 — A page with no transport offers commands, not buttons ⬜

**Goal.** A `file://` page has no server to POST to and no store to write to, so
its verdict buttons cannot deliver anything — they hand over a JSON blob to
paste. Where the reader's pass carries nothing but a verdict, a command can
carry it instead, and that is a far better thing to hand someone reading on a
laptop beside their terminal.

## Tasks

- [ ] `/spec-reviewed <verdict>` — the skill accepts a verdict word alongside
      the six-digit code it already takes, and routes it exactly as a claimed
      pass carrying only that verdict. It stays user-only: a person typing the
      word IS the human signal, which is the same argument the code rests on.
- [ ] `spec-env review <spec> --verdict <word>` underneath it, joining the same
      merge a claim goes through so nothing downstream can tell them apart.
- [ ] On a `file://` page, replace the verdict bar with a stacked list — one row
      per offered verdict, **labelled with the button's own name** (`✓ Commit &
      Continue`, not `commit-continue`), carrying its command and a Copy
      control. The set follows `OFFERED`, so a mid-run page lists `→ Continue`
      and never the committing pair.
- [ ] Copy puts the command on the clipboard and then shows the same You chose
      box the served path shows, with the command repeated in it — so a copy
      that silently failed, or a reader coming back an hour later, still has it.
- [ ] No clipboard (the ordinary `file://` case) → the row selects its command
      and says so, exactly as the served path already does.
- [ ] **Marks do not fit in a command line.** The moment the pass carries an
      accept or a comment, the rows give way to the blob the page hands over
      today — announced, never silent, because dropping what someone wrote is
      worse than asking them to paste.
- [ ] Tests green: the `file://` half of `assets-review.test.js`, the skill
      guard in `assets-spec-reviewed.test.js`, then the full `node --test`.
