---
linear_issue_id: "SKS-186"
---

# Phase 1 — Serve the page, rendered per request ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-env review serve` puts every spec's diff on `http://localhost`,
rendered fresh on each request, with nothing written to disk.

## Tasks

- [ ] Add `packages/common/src/env/serve.js` — a `node:http` server in the shape
      of `proxy.js` (which already has `createRouteServer`, `portsInUse` and
      `checkListening`; copy its style and reuse those helpers rather than
      re-deriving them). **No new dependency.**
- [ ] Routes: `/` an index of every spec with a worktree (name, branch, file and
      +/− counts, link); `/<spec>` the page; `/<spec>?branch=1` the whole-spec
      view. Render by calling `collectReview` + `renderReviewPage` per request —
      **never** by reading a file from `.spec-env/reviews/`.
- [ ] Serve the full document as-is. The server owns the response, so the
      wrapper that makes publishing awkward is exactly right here — this is the
      path with no transform.
- [ ] Bind `127.0.0.1` by default. `--host 0.0.0.0` opts in, mints a random path
      token, and prints the LAN URL including it; requests outside the token
      prefix get 404, not a redirect (a redirect confirms the server exists).
- [ ] Wire `spec-env review serve [--port N] [--host H] [--stop] [--status]` into
      `cli.js`, reusing `supervise.js`'s pidfile + process-group handling so
      `--stop` kills what `serve` started and `--status` answers honestly when
      nothing is running. Read the default port from `review.servePort`.
- [ ] Print what was bound, every time: the local URL, and the LAN URL plus one
      line saying anyone with it can read every spec's diff while it runs.
- [ ] A spec with no worktree is omitted from the index rather than listed as an
      error — an unstarted spec has nothing to diff, which is ordinary.
- [ ] Tests (`packages/common/test/env-review-serve.test.js`): start on an
      ephemeral port against a real git fixture, fetch `/` and `/<spec>`, assert
      the index lists the spec and the page carries the data island; assert
      `?branch=1` reports `mode: branch`.
- [ ] **Stays-silent tests:** loopback is the default when `--host` is absent; a
      tokened server 404s an untokened path; `--status` with nothing running says
      so and exits 0; a spec with no worktree is absent from the index without an
      error anywhere.
- [ ] Run the project's test command — green before the phase is done.

## Notes

The point of rendering per request is that there is no snapshot to go stale. A
page on disk is a photograph of one moment, which is why a phase-end page has to
be re-rendered to stay true; a served page cannot be out of date.

Do not have the server write `.spec-env/reviews/` as a side effect. The file path
and the served path are two answers to the same question, and keeping them
independent is what stops one quietly becoming the other's cache.
