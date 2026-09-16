---
linear_issue_id: "SKS-309"
---

# Phase 2 — Detection goes back to deciding wording ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `detectReader` affects only what the output says, which is what its own
comment has claimed all along — and the `file://` fallback says something true
about why it is there.

## Tasks

- [x] Repair `detectReader`'s doc comment. It currently asserts *"Nothing in the
      engine serves, publishes or refuses on the strength of it"*, which was false
      from the moment serving was wired to it. After phase 1 it is true again —
      say so, and say that it stopped being true once, because that is the fault
      this spec fixes and the comment is where the next reader will look.
- [x] Assert the contract rather than only documenting it: a test that the serve
      decision does not read `reader`, so re-wiring them cannot pass silently.
- [x] Rework the `file://` fallback wording. It now means *serving did not
      happen*, which is new — today it means *nobody asked for serving*. Say
      which it was: `serve: "never"`, or a failure with its reason.
- [x] Keep `will not open where you are reading` for a **remote** reader on that
      fallback, and only there. It is the one line detection still earns, and it
      is now rarer and more informative than before.
- [x] Tests: the fallback names the reason it fell back; the remote warning
      appears on a failed serve and not on a `serve: "never"` render, where the
      operator chose it; the wording for `local` and `unknown` is unchanged.
- [x] **Stays-silent test** (rule 3): an `unknown` reader is still not announced
      and not warned about — `unknown` is the ordinary state of a local machine,
      and a warning there accuses a healthy session.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

This phase is where the spec pays back the thing that made the original fault
hard to see: a comment stating an invariant the code had stopped honouring.
Leaving the comment stale while fixing the code would set the same trap for
whoever next wonders whether detection may be made load-bearing.

The contract test is the half that outlives the comment. A comment cannot fail.

**The plan's first task was wrong, and the spec now says what is true instead.**
It asked for the comment's claim — *"nothing in the engine serves on the
strength of it"* — to be restored as written. Phase 1 kept `reader` for the
**bind**, so restoring that sentence would have replaced one false claim with
another. The comment now says what detection decides — the wording and the
bind — and explicitly that it does *not* decide whether to serve.

**Three guards, not one.** The plan asked for a test that the serve decision
does not read `reader`; that one is anchored to the `if` line rather than the
block, because the bind inside the block reads `reader` **on purpose** and a
test banning the word outright would forbid the thing that keeps this free of
new exposure. So there is a second, positive guard asserting the bind *does*
read it, and a third that the comment still records what the old design cost.
Proved by mutation: re-wiring serving to the reader fails the first, and
binding `0.0.0.0` unconditionally fails the exposure test in the reader suite.

**`up.error` is a code, not a sentence.** It returns `busy` / `unreadable` for
a caller, and `not served: busy` does not tell a reader which port to free —
the port is the whole of what they can act on. Translated where the person sees
it, with an unmapped code passed through rather than swallowed.
