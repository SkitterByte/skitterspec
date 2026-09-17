---
linear_issue_id: "SKS-312"
---

# Phase 2 — The docs site ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `docs/index.html` and `docs/linear.html` show the review loop and a
command reference that matches what ships, under the same guard as phase 1.

## Tasks

- [ ] Extend phase 1's guard to both pages, so the site is compared against the
      shipped set exactly as the READMEs are. It should fail immediately on
      `/spec-reviewed` being absent from the base page's command reference.
- [ ] Remove the stale `Review` row at `docs/index.html:581` — the same
      `want a written review before you commit?` the negative half bans.
- [ ] Add the loop to the base page: the page is rendered, read, and ended in a
      verdict; what each of the four does; and that a phase which ended owes an
      answer.
- [ ] Add `/spec-reviewed` to the command reference, described as the way in for
      a pass sent when nothing was waiting.
- [ ] Mirror whatever `linear.html` needs — it owns the superset end to end, so
      check whether its walkthrough ends somewhere the review loop should appear.
- [ ] **Two pages, no build step.** All CSS/JS is inlined by design
      (`docs/README.md`), so edit the HTML directly and do not introduce a
      generator for this.
- [ ] **Stays-silent test** (rule 3): the marketing copy above the fold is not a
      command reference, so the guard must not demand the full set there — it
      checks the reference section, and a page that mentions two commands in
      prose is not failing.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

The site is the one surface a prospective user reads *before* installing, so the
loop being absent there is the version of this problem that costs adoption
rather than trust.
