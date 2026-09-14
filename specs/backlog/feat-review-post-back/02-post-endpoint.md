---
linear_issue_id: "SKS-219"
---

# Phase 2 — The server accepts a POST ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the running server takes a pass at the page's own URL and answers with
its code, having written nothing but the pending file.

## Tasks

- [ ] Teach `routeFor` the method. It currently ignores `req.method` entirely, so
      a POST renders HTML — that absence is why the paste was the only way in.
- [ ] Handle `POST /<token>/<spec>`: read the body with a **size cap**, parse it,
      run the real `validateNotesBlob`, and refuse with the engine's own message
      on a bad one. A pass is untrusted input on the way in, exactly as it is
      through the clipboard.
- [ ] Write it to the pending store from phase 1 and answer `200` with
      `{ code }`. Nothing else is written, and the notes sidecar is untouched.
- [ ] Refuse a POST to the index route and to an unknown spec, with the same 404
      the GET gives — a write path must not become a way to enumerate what exists.
- [ ] Cap and reject: a body over the cap, a body that is not JSON, and a blob
      naming a different spec than the URL, each with a distinct message.
- [ ] Tests: a POST stores exactly one pending pass and returns its code; a bad
      blob is refused and stores nothing; an oversized body is refused before it
      is parsed; a GET to the same URL still renders as it always did.
- [ ] **Stays silent:** the whole existing GET suite passes untouched. A server
      that grew a write path must not have changed what reading does
      (`.claude/rules/negative-checks.md` rule 3).
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

This is the phase that **opens a write path to anyone on the network**, so it is
the one to be strict in: cap the body, validate wholesale, and write only to the
holding area. Decision 2 is what keeps the blast radius at "a stranger can queue
a pass that nobody will claim".
