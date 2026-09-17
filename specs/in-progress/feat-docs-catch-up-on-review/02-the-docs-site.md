---
linear_issue_id: "SKS-312"
---

# Phase 2 — The docs site ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `docs/index.html` and `docs/linear.html` show the review loop and a
command reference that matches what ships, under the same guard as phase 1.

## Tasks

- [x] Extend phase 1's guard to both pages, so the site is compared against the
      shipped set exactly as the READMEs are. It should fail immediately on
      `/spec-reviewed` being absent from the base page's command reference.
- [x] Remove the stale `Review` row at `docs/index.html:581` — the same
      `want a written review before you commit?` the negative half bans.
- [x] Add the loop to the base page: the page is rendered, read, and ended in a
      verdict; what each of the four does; and that a phase which ended owes an
      answer.
- [x] Add `/spec-reviewed` to the command reference, described as the way in for
      a pass sent when nothing was waiting.
- [x] Mirror whatever `linear.html` needs — it owns the superset end to end, so
      check whether its walkthrough ends somewhere the review loop should appear.
- [x] **Two pages, no build step.** All CSS/JS is inlined by design
      (`docs/README.md`), so edit the HTML directly and do not introduce a
      generator for this.
- [x] **Stays-silent test** (rule 3): the marketing copy above the fold is not a
      command reference, so the guard must not demand the full set there — it
      checks the reference section, and a page that mentions two commands in
      prose is not failing.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

The site is the one surface a prospective user reads *before* installing, so the
loop being absent there is the version of this problem that costs adoption
rather than trust.

**The site was not short of prose — it was wrong.** The spec expected absence,
and `docs/index.html` turned out to carry a long, careful `#review` section
documenting a **superseded security model**: *"a device that reaches your page
cannot reach your conversation. A pass it queues sits there forever."* That was
the whole guard once, and it was replaced deliberately by the serve token plus
the claim window when the phase learnt to wait. A page asserting the old one is
worse than a page saying nothing, so it went into the negative half by name,
along with two more found the same way — `review.commitWith: "none"` as a valid
value (removed), and *"it names that code back for you to check"* (the read-back
round-trip, gone).

**And one existing assertion had to be loosened, for a reason worth keeping.**
*Documented but not shipped* is now checked against the **union** of what every
distribution ships, not per-surface. `linear.html`'s `/spec-list` card says the
folder name is what you paste into `/spec-start <name>` — true, useful, and read
by a per-surface check as the provider claiming to ship a base command. What
that half is actually for is a name that ships **nowhere**: a removal, or a
typo. A test asserts it still fires on one, so the loosening did not make it
decorative.

**`docs/linear.html` is held to the provider's six, not the superset's 21**, and
that differs from the npm superset README on purpose. The README is the only
document inside that package, so someone who installs it and reads nothing else
must find everything there. `linear.html` sits beside `index.html` on one site
and links to it; making it restate the base's fifteen would be a worse page, not
a more complete one.
