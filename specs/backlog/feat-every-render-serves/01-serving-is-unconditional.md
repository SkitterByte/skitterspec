---
linear_issue_id: "SKS-308"
---

# Phase 1 — Serving stops asking where the reader is ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every render hands back an `http://` URL — a loopback one on a local
or unknown session, the LAN one unchanged when detection says remote — so the
page can always POST a verdict.

## Tasks

- [ ] Drop the `reader.reader === 'remote'` half of the serve condition
      (`cli.js:2587`) so the server comes up on every render. Keep the
      `config.review.serve` half as the only gate.
- [ ] Pick the bind from the existing reader rule rather than a new one:
      `0.0.0.0` for `remote` (**unchanged**), loopback for `local` and
      `unknown`. Write down beside it that this adds no exposure — the change is
      `file://` → `http://127.0.0.1`, not a new listener on the network.
- [ ] Add `review.serve: "always" | "never"`, defaulting to `always`, validated
      the way `serveOnRemote` was — a non-enum value falls through to the
      default rather than refusing.
- [ ] Read a legacy `serveOnRemote: false` as `serve: "never"` at load time, and
      say in a comment that it is tolerance rather than migration: these configs
      are committed, so a rename with no tolerance breaks other checkouts.
- [ ] **Invert the two tests that pin the gate shut** — `a local reader starts no
      server at all` and `an unknown reader starts no server either`
      (`env-review-reader.test.js`). They become: each gets a server and an
      `http://` link, and the bind is loopback. Keep the assertion that a
      **remote** reader gets a LAN URL exactly as it is; that is the path this
      spec must not disturb.
- [ ] Tests: a local render prints `open: http://127.0.0.1:` and writes a pid
      file; an unknown render does the same; a remote render still prints the LAN
      URL and binds `0.0.0.0`; `serve: "never"` returns the `file://` link;
      `serveOnRemote: false` does the same through the tolerance path.
- [ ] **Stays-silent test** (rule 3): a busy port still falls back to the
      `file://` link and still exits 0 — a port in use is not evidence of
      anything wrong with the repo. The existing test for this must keep
      passing untouched.
- [ ] **Stays-silent test**: a second render adopts the running server rather
      than restarting it, for a local reader as well as a remote one — the
      existing adoption test is remote-only, so serving everywhere makes
      adoption matter everywhere.
- [ ] Run the project's typecheck and test commands (see
      `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

The two tests being inverted are not stale — they are correct assertions about a
design being deliberately replaced, so each wants its reasoning comment
rewritten rather than deleted. `'nothing was started for a reader who is sitting
right here'` was a real argument; what defeats it is that the reader sitting
right here also cannot send a verdict from a `file://` page.

`--host` on `review serve` stays exactly as it is. It is the manual escalation
for an unknown reader who turns out to be remote, and the `serve:` hint already
names it.
