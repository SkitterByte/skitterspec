---
linear_issue_id: "SKS-309"
---

# Phase 2 — Detection goes back to deciding wording ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `detectReader` affects only what the output says, which is what its own
comment has claimed all along — and the `file://` fallback says something true
about why it is there.

## Tasks

- [ ] Repair `detectReader`'s doc comment. It currently asserts *"Nothing in the
      engine serves, publishes or refuses on the strength of it"*, which was false
      from the moment serving was wired to it. After phase 1 it is true again —
      say so, and say that it stopped being true once, because that is the fault
      this spec fixes and the comment is where the next reader will look.
- [ ] Assert the contract rather than only documenting it: a test that the serve
      decision does not read `reader`, so re-wiring them cannot pass silently.
- [ ] Rework the `file://` fallback wording. It now means *serving did not
      happen*, which is new — today it means *nobody asked for serving*. Say
      which it was: `serve: "never"`, or a failure with its reason.
- [ ] Keep `will not open where you are reading` for a **remote** reader on that
      fallback, and only there. It is the one line detection still earns, and it
      is now rarer and more informative than before.
- [ ] Tests: the fallback names the reason it fell back; the remote warning
      appears on a failed serve and not on a `serve: "never"` render, where the
      operator chose it; the wording for `local` and `unknown` is unchanged.
- [ ] **Stays-silent test** (rule 3): an `unknown` reader is still not announced
      and not warned about — `unknown` is the ordinary state of a local machine,
      and a warning there accuses a healthy session.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

This phase is where the spec pays back the thing that made the original fault
hard to see: a comment stating an invariant the code had stopped honouring.
Leaving the comment stale while fixing the code would set the same trap for
whoever next wonders whether detection may be made load-bearing.

The contract test is the half that outlives the comment. A comment cannot fail.
