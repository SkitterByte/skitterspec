---
linear_issue_id: "SKS-186"
---

# Phase 1 — Serve the page, rendered per request ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `spec-env review serve` puts every spec's diff on `http://localhost`,
rendered fresh on each request, with nothing written to disk.

## Tasks

- [x] Add `packages/common/src/env/serve.js` — a `node:http` server in the shape
      of `proxy.js` (which already has `createRouteServer`, `portsInUse` and
      `checkListening`; copy its style and reuse those helpers rather than
      re-deriving them). **No new dependency.**
- [x] Routes: `/` an index of every spec with a worktree (name, branch, file and
      +/− counts, link); `/<spec>` the page; `/<spec>?branch=1` the whole-spec
      view. Render by calling `collectReview` + `renderReviewPage` per request —
      **never** by reading a file from `.spec-env/reviews/`.
- [x] Serve the full document as-is. The server owns the response, so the
      wrapper that makes publishing awkward is exactly right here — this is the
      path with no transform.
- [x] Bind `127.0.0.1` by default. `--host 0.0.0.0` opts in, mints a random path
      token, and prints the LAN URL including it; requests outside the token
      prefix get 404, not a redirect (a redirect confirms the server exists).
- [x] Wire `spec-env review serve [--port N] [--host H] [--stop] [--status]` into
      `cli.js`, reusing `supervise.js`'s pidfile + process-group handling so
      `--stop` kills what `serve` started and `--status` answers honestly when
      nothing is running. Read the default port from `review.servePort`.
- [x] Print what was bound, every time: the local URL, and the LAN URL plus one
      line saying anyone with it can read every spec's diff while it runs.
- [x] A spec with no worktree is omitted from the index rather than listed as an
      error — an unstarted spec has nothing to diff, which is ordinary.
- [x] Tests (`packages/common/test/env-review-serve.test.js`): start on an
      ephemeral port against a real git fixture, fetch `/` and `/<spec>`, assert
      the index lists the spec and the page carries the data island; assert
      `?branch=1` reports `mode: branch`.
- [x] **Stays-silent tests:** loopback is the default when `--host` is absent; a
      tokened server 404s an untokened path; `--status` with nothing running says
      so and exits 0; a spec with no worktree is absent from the index without an
      error anywhere.
- [x] Run the project's test command — green before the phase is done.

## Notes

The point of rendering per request is that there is no snapshot to go stale. A
page on disk is a photograph of one moment, which is why a phase-end page has to
be re-rendered to stay true; a served page cannot be out of date.

Do not have the server write `.spec-env/reviews/` as a side effect. The file path
and the served path are two answers to the same question, and keeping them
independent is what stops one quietly becoming the other's cache.

## Outcome

Fourteen tests, all green; full suite **1944 pass, 0 fail**. Verified by hand
against this repo too: the index listed both live specs, and its counts for
`feat-diff-reaches-the-reader` were **7 files, +608 −50** — byte-identical to
what `spec-env review --json` reported for the same tree.

**A refactor the phase did not name, and could not avoid.** `serve.js` has to
resolve specs per request, and the three helpers that find them
(`liveWorktreePaths`, `collectSpecFolders`, `allSpecs`) lived in `cli.js` —
importing that from `env/` is a cycle. They moved to `resolve.js`, which is
where they belonged: they are resolution, and every other function there already
takes an injected git reader, so `liveWorktreePaths(git)` now matches its
neighbours instead of reaching for `cli.js`'s reader. Eleven call sites, all
inside `cli.js`, all unchanged in name. The alternative — a snapshot of the spec
list written into the settings file at start time — would have made a spec
provisioned *after* `serve` started invisible until a restart, which is a worse
property than a tidy module boundary is worth.

**`parseNumstat` was the wrong tool for the index** and the first attempt used
it: it reads only the first row, by design, because every other caller asks it
about one file. The index parses multi-line `--numstat` itself and measures each
untracked file against `/dev/null` — one process per untracked file, which is
what the page already pays. Exactness was worth it: an index and a page
disagreeing about the same spec is a bug report waiting to happen.

**Not done, deliberately:** the settings file carries `dir` only, so there is no
snapshot anywhere and `--port`/`--host` changes take effect on restart. The
server is supervised like the proxy (detached, pidfile, `--stop`/`--status`), and
`--status` decides on `isAlive` rather than on the pidfile existing, so a crashed
server reads as not running instead of as running.
