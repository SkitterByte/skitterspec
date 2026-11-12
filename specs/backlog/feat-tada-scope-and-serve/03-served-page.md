---
github_issue_id: "#194"
---

# Phase 3 — Readable dates and a served page ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the page is rendered per request by the review server, with the
recap as a sidecar and human dates — proven by route and render tests.

## Tasks

- [ ] Human date labels for one day and a span (`window.js`); used by the
      text header and the page
- [ ] `--page` saves the recap to `.spec-env/tada/<label>.md` (gitignored)
      and prints the local/network/remote stack for
      `/<token>/tada?since=…|on=…`
- [ ] Review server: a `tada` route that builds the digest per request and
      renders it with the saved recap and when it was written; never reads a
      stored page
- [ ] Page header: the running project's `project.name` and category
- [ ] Fallback: no isolation or no server → the temp-folder `file://` page,
      as today
- [ ] Skill: relay the stack the way review pages do; update
      `docs/reference.html` and `docs/review.html`
- [ ] Tests: date labels; route parsing (token required, window from the
      query, bad window → 400 not a guess); render with and without a recap;
      fallback; run `pnpm test` — green
