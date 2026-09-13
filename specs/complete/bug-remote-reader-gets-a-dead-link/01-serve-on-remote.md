---
linear_issue_id: "SKS-198"
---

# Phase 1 — Serve on a remote reader ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the `open:` line a remote reader receives is a URL they can open. The
server is started if it is not already up, and every way that can fail lands back
on today's output rather than on an error.

- [x] Add `review.serveOnRemote` (default `true`) to the frozen defaults in
      `packages/common/src/env/config.js:117`, alongside `reader` and `servePort`.
- [x] Extract the start path of `specEnvReviewServe`
      (`packages/common/src/cli.js:1863-1893`) into `ensureReviewServer(dir, config,
      { host })`, returning `{ port, token, pid, started }` or `null`. `serve`
      keeps its own printing — only the start is shared, so the two cannot drift
      on how a server is brought up.
- [x] Reuse a running server rather than restarting it: read the pidfile, and when
      `isAlive`, read `review-serve.json` for its port and token. A restart would
      mint a new token and invalidate a URL the operator may already have open on
      their phone.
- [x] In `specEnvReview`, when `reader.reader === 'remote'` and `serveOnRemote`,
      call `ensureReviewServer` with `host: '0.0.0.0'` and print `open:` as
      `http://<addr>:<port>/<token>/<spec>`. Keep `page:` as the filesystem path —
      it is still the truth about where the page is.
- [x] Drop the `serve:` hint on that branch; it named a command the engine has
      just run.
- [x] Take `lanAddresses()[0]` **provisionally**, and say so in a comment. On the
      machine this bug was found on the real wifi adapter happens to come first,
      so this phase works here by luck; phase 2 owns making that a choice rather
      than an accident.
- [x] Fall back to the current `file://` output, unchanged and with its
      `will not open where you are reading` marker, whenever the server cannot be
      had — port busy, never came up, or `serveOnRemote` off. **Never throw.**
- [x] `--json` gains `served: { url, port, token, started }`, `null` when not
      served, so a skill reads the outcome rather than parsing the text.

## Tests

- [x] The red test passes: a remote reader's `open:` is `http://…/feat-alpha`.
- [x] `serveOnRemote: false` gives byte-identical output to today, including the
      `serve:` hint — the opt-out is a real opt-out.
- [x] A second `review` call reuses the running server: same port and **same
      token**, and no new pid.
- [x] **Stays silent** (`.claude/rules/negative-checks.md` rule 3): a `local`
      reader and an `unknown` reader still get `file://`, no server is started,
      and no pidfile appears. This is the assertion that stops the fix from
      standing up a LAN listener on every developer's laptop.
- [x] Port already in use → the `file://` output, and a non-zero exit is **not**
      produced. Bias the unknown case toward inaction (rule 4).
- [x] Publishing is still never automatic on a remote reader — no `.url`, no
      `.publish.html`. The half of the old decision that was right stays tested.

## Outcome

Green. Two things not in the plan, both forced by the change rather than chosen:

- **The stdout capture in `env-review-reader.test.js` had to become a child
  process.** `specEnvReview` is now async, and under `node --test` the test file
  IS a child emitting TAP on stdout — so patching `process.stdout.write` to
  capture CLI output swallowed the runner's own protocol the moment a test
  awaited anything. It was invisible while `review` returned within a tick. A
  separate process has a separate stdout, so there is nothing to share.
- **Three other review test files had to state their reader.**
  `env-review-{notes,publish-copy,fallback}.test.js` left `reader` at `detect`,
  which resolves to `remote` whenever the suite runs from a bridged or ssh
  session — so they would have stood a real LAN server up mid-test. Pinned to
  `reader: local`, which is what they always meant: they are about notes,
  publish copies and fallback, not about where the operator is sitting.

The second one is worth keeping in view. The engine is behaving correctly in
both cases; what it exposed is that "inherit the ambient environment" was load-
bearing in tests that never meant to depend on it.
