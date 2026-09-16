---
linear_issue_id: "SKS-299"
---

# Phase 3 — Point a spec back at its issue ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a spec that has lost its link gets pointed back at the issue that
already exists, and a push stops minting a twin over the top of one.

## Tasks

- [ ] `skitterspec spec-sync reattach <spec> [--to <ISSUE-REF>] [--json]`.
      Bare: search the team for issues titled as this spec is, drop every
      identifier `spec-sync linked` already accounts for, and act on what is
      left. `--to` names one exactly and skips the search.
- [ ] **Three answers, and only one acts.** Exactly one unclaimed candidate →
      stamp it. **None** → say so and write nothing. **More than one** → list
      them and refuse, never pick. That is the same refusal `--claim-since`
      makes, and for the same reason: choosing between two is the guess this
      exists to avoid.
- [ ] Stamp through `spec-sync stamp`, not by hand-editing frontmatter — it
      validates before writing and leaves nothing half-stamped.
- [ ] **Re-attach the sub-issues too**, or say plainly that it did not. A spec
      issue with unlinked phases is half a link, and the next push would mint a
      sub-issue per phase beside the ones already there — the SKS-284 failure
      one level down. Match children of the re-attached issue to phase files by
      title; refuse the ambiguous ones individually rather than the whole run.
- [ ] Minting refuses over an unclaimed **exact** title match in the same team:
      name the identifier, point at `reattach`, and write nothing. `--force-new`
      is the escape for a genuine duplicate title.
- [ ] **Exact, never fuzzy.** A near-match is not evidence, and a refusal on one
      would block a legitimate mint over a spec that merely reads similarly
      (`.claude/rules/negative-checks.md` rule 1). Write the blind spot beside
      the check: *a renamed spec will not be found, and `--to` is the answer to
      that.*
- [ ] **It never reads content back.** `reattach` writes an id and nothing else
      — no title, no description, no state. Assert it in a test, because this is
      the one command whose shape makes a pull tempting.
- [ ] Tests: one unclaimed match stamps; several refuse and name them; none
      writes nothing; an identifier another spec claims is excluded from the
      candidates; `--to` bypasses the search; minting over an unclaimed exact
      match refuses and `--force-new` proceeds.
- [ ] Stays-silent test: a spec that is already linked, and a mint with no
      title collision, both behave exactly as they do today.
- [ ] `/spec-push` gains a short section: what a refused mint means, and that
      `reattach` is the way back.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

The incident this is written against: a `sed '1s/…'` clobbered the opening `---`
of a phase file's frontmatter after it had been stamped, orphaning
`linear_issue_id: "SKS-283"` into the body. The next push saw an unlinked phase
and minted **SKS-284** beside the live SKS-283, which had to be cancelled by
hand. Both halves of this phase — finding the orphan, and refusing to mint over
it — come from that.
