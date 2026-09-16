---
linear_issue_id: "SKS-299"
---

# Phase 3 — Point a spec back at its issue ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a spec that has lost its link gets pointed back at the issue that
already exists, and a push stops minting a twin over the top of one.

## Tasks

- [x] `skitterspec spec-sync reattach <spec> [--to <ISSUE-REF>] [--json]`.
      Bare: search the team for issues titled as this spec is, drop every
      identifier `spec-sync linked` already accounts for, and act on what is
      left. `--to` names one exactly and skips the search.
- [x] **Three answers, and only one acts.** Exactly one unclaimed candidate →
      stamp it. **None** → say so and write nothing. **More than one** → list
      them and refuse, never pick. That is the same refusal `--claim-since`
      makes, and for the same reason: choosing between two is the guess this
      exists to avoid.
- [x] Stamp through `spec-sync stamp`, not by hand-editing frontmatter — it
      validates before writing and leaves nothing half-stamped.
- [x] **Re-attach the sub-issues too**, or say plainly that it did not. A spec
      issue with unlinked phases is half a link, and the next push would mint a
      sub-issue per phase beside the ones already there — the SKS-284 failure
      one level down. Match children of the re-attached issue to phase files by
      title; refuse the ambiguous ones individually rather than the whole run.
- [x] Minting refuses over an unclaimed **exact** title match in the same team:
      name the identifier, point at `reattach`, and write nothing. `--force-new`
      is the escape for a genuine duplicate title.
- [x] **Exact, never fuzzy.** A near-match is not evidence, and a refusal on one
      would block a legitimate mint over a spec that merely reads similarly
      (`.claude/rules/negative-checks.md` rule 1). Write the blind spot beside
      the check: *a renamed spec will not be found, and `--to` is the answer to
      that.*
- [x] **It never reads content back.** `reattach` writes an id and nothing else
      — no title, no description, no state. Assert it in a test, because this is
      the one command whose shape makes a pull tempting.
- [x] Tests: one unclaimed match stamps; several refuse and name them; none
      writes nothing; an identifier another spec claims is excluded from the
      candidates; `--to` bypasses the search; minting over an unclaimed exact
      match refuses and `--force-new` proceeds.
- [x] Stays-silent test: a spec that is already linked, and a mint with no
      title collision, both behave exactly as they do today.
- [x] `/spec-push` gains a short section: what a refused mint means, and that
      `reattach` is the way back.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

The incident this is written against: a `sed '1s/…'` clobbered the opening `---`
of a phase file's frontmatter after it had been stamped, orphaning
`linear_issue_id: "SKS-283"` into the body. The next push saw an unlinked phase
and minted **SKS-284** beside the live SKS-283, which had to be cancelled by
hand. Both halves of this phase — finding the orphan, and refusing to mint over
it — come from that.

**The phase match reuses the projection**, not a second reading of the same
headings. `projectionOf(...).subIssues` already carries each phase's `ref`, its
`name` — the exact title a push would create — and whether it is linked. So a
re-attach matches against what a push *would have made*, and skips phases that
are already fine. `resolvePhaseFile` maps the ref to a file exactly as `apply`
does, rather than spelling that rule twice.

**Four existing guards walked the contract in**, and each was right to. Two
`assets-*` tests caught a `**bold**` span crossing a hard line break; one caught
that a verb the engine dispatches was absent from `docs/linear.html`; and one
caught that the docs said a user types `reattach` while `/spec-sync`'s routing
table did not mention it. None of that was in the phase's task list, and all of
it belonged.

**The mint guard needed `forceNew` threaded through.** `applyOneSpecInner` takes
an explicit argument set rather than `flags`, so the first attempt threw
`flags is not defined` — inside the very try/catch phase 2 added, which reported
it cleanly as `nothing was created`. The failure path worked on its own bug.
