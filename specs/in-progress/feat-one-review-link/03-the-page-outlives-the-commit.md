---
linear_issue_id: "SKS-317"
---

# Phase 3 — A docs page outlives its verdict ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** pressing `Commit` on a spec's page and reloading it shows the spec,
not a 404 — so honouring a verdict stops destroying the page it came from.

## Tasks

- [x] **Reproduce it as a test first:** render a `--docs` page, commit the spec's
      documents, request the page again, and assert 200. It is red today —
      `specDocsIn` reports `empty` once nothing is uncommitted, so `viewFor`
      returns null and the route 404s.
- [x] Fall back to the spec's **committed** documents at `HEAD` when it has no
      uncommitted ones, mirroring the phase page's clean-tree fallback and for
      the same reason: the page is rendered before the commit and read after it.
- [x] **Keep the fallback only where it found something**, exactly as the branch
      fallback does — a spec with no documents at all must still 404 rather than
      render an empty page with a commit button on it.
- [x] Say on the page which it is showing: the uncommitted documents, or the spec
      as committed. A reader who pressed a verdict and reloads should be able to
      tell that their press landed.
- [x] Tests: a committed spec's docs page answers 200 and shows its documents; a
      spec folder that does not exist still 404s; a page rendered before a commit
      and reloaded after it does not change what it claims to be showing without
      saying so.
- [x] **Stays-silent test** (rule 3): a spec **with** uncommitted documents still
      shows those, not the committed version — the fallback must add a case, not
      replace the primary one.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

This is the cause that actually stranded a reader today, and it is the least
obvious of the four: the link was valid, the server was up, the network was fine,
and the page had been destroyed by honouring the verdict pressed on it.

The other three causes are about the URL; this one is about the resource. Fixing
the URL without this leaves a stable link to nothing.

**The fallback belongs to the named page and NOT to the index**, which the plan
did not anticipate and two existing tests immediately caught. The two routes ask
different questions: the index is a menu of what *awaits* review, so every
completed spec in the repo falling back would fill it with dozens of finished
ones — which is exactly why it omits them. A direct request is someone opening
an address they were given. `viewFor` takes a `fallback` flag; the render passes
it and the index does not.

**Scoped to the CLI's served route, not its render.** The plan said the fallback
mirrored the phase page's clean-tree fallback, which lives in both the CLI render
and the server. Only the server got it: the CLI render happens *before* the
commit, so it always has uncommitted documents — and `/spec-review`'s no-drift
decision (do not render a page asking for a verdict on nothing) stays intact
because of that.

**The POST follows the page.** `receivePass` opts into the same fallback, so a
reader who reloads a committed page and presses a button is not silently
refused. That inverted an existing assertion — *"a spec whose worktree is gone
receives nothing"* — whose premise was the very thing that made a button appear
to do nothing. The case that must still refuse is pinned beside it: a name that
is no spec at all has no page, so a POST to it is nobody pressing anything.

**Three existing assertions moved in this phase**, each with its reasoning
rewritten rather than deleted. That is the third time in this spec, and the
pattern is the same every time: the assertion was right about the old design and
its stated reason had quietly stopped being true.
