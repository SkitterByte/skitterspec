---
linear_issue_id: "SKS-317"
---

# Phase 3 — A docs page outlives its verdict ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** pressing `Commit` on a spec's page and reloading it shows the spec,
not a 404 — so honouring a verdict stops destroying the page it came from.

## Tasks

- [ ] **Reproduce it as a test first:** render a `--docs` page, commit the spec's
      documents, request the page again, and assert 200. It is red today —
      `specDocsIn` reports `empty` once nothing is uncommitted, so `viewFor`
      returns null and the route 404s.
- [ ] Fall back to the spec's **committed** documents at `HEAD` when it has no
      uncommitted ones, mirroring the phase page's clean-tree fallback and for
      the same reason: the page is rendered before the commit and read after it.
- [ ] **Keep the fallback only where it found something**, exactly as the branch
      fallback does — a spec with no documents at all must still 404 rather than
      render an empty page with a commit button on it.
- [ ] Say on the page which it is showing: the uncommitted documents, or the spec
      as committed. A reader who pressed a verdict and reloads should be able to
      tell that their press landed.
- [ ] Tests: a committed spec's docs page answers 200 and shows its documents; a
      spec folder that does not exist still 404s; a page rendered before a commit
      and reloaded after it does not change what it claims to be showing without
      saying so.
- [ ] **Stays-silent test** (rule 3): a spec **with** uncommitted documents still
      shows those, not the committed version — the fallback must add a case, not
      replace the primary one.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

This is the cause that actually stranded a reader today, and it is the least
obvious of the four: the link was valid, the server was up, the network was fine,
and the page had been deliberately destroyed by honouring the verdict pressed on
it. Worth stating in the code, because the next person will read the 404 as a
serving problem.

The other three causes are about the URL; this one is about the resource. Fixing
the URL without this leaves a stable link to nothing.
