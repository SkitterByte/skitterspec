---
linear_issue_id: "SKS-308"
---

# Phase 1 — Serving stops asking where the reader is, or for a worktree ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every render hands back an `http://` URL — a loopback one on a local
or unknown session, the LAN one unchanged when detection says remote — **and
that URL answers 200** for a spec with no worktree, so the page can always POST
a verdict.

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
- [ ] **Relax the served route's own worktree gate.** `serve.js` re-renders on
      every request and returns 404 when the spec has no worktree
      (`if (!spec || !fs.existsSync(spec.worktreePath)) return null` at three
      call sites). That is a *second* gate, separate from the decision to serve,
      and it is the one that actually 404s an authoring page: a `--docs` page
      belongs to a spec with no worktree by definition.
- [ ] Serve a worktree-less spec as the **docs** view, reading the primary
      checkout the server is anchored to and filtering to that spec's `owned`
      paths — the same classification `spec-env review --docs` uses, so the
      served page and the written page cannot disagree about what they show.
- [ ] **Include worktree-less specs in the index.** `resolveServable` lists
      "every spec with a worktree of its own", so a backlog spec is omitted from
      the server's own listing even once its page serves. Both halves or
      neither.
- [ ] Tests: **a backlog spec's docs page returns 200 from the server** — the
      case that broke, and the reason this is in phase 1 rather than a later one;
      the index lists a spec with no worktree; the served docs page shows that
      spec's documents and not another's.
- [ ] Tests: a local render prints `open: http://127.0.0.1:` and writes a pid
      file; an unknown render does the same; a remote render still prints the LAN
      URL and binds `0.0.0.0`; `serve: "never"` returns the `file://` link;
      `serveOnRemote: false` does the same through the tolerance path.
- [ ] **Stays-silent test** (rule 3): a spec **with** a worktree still serves
      exactly as it does today — same route, same rendered view. The relaxation
      must add a case rather than change the existing one.
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

**Why the serve-path gate is in this phase and not a later one.** It was missed
when the spec was written, and the miss is the same one that shipped in
`feat-a-new-spec-gets-a-page`: that spec relaxed the worktree gate in
`spec-env review --docs` and left the identical gate in `serve.js` untouched, so
an authoring page could be written but never served — and `file://`, the only
transport left, is the one that cannot POST a verdict. Landing phase 1 without
this would let the spec claim serving was fixed while the reported page still
404s.

The two tests being inverted are not stale — they are correct assertions about a
design being deliberately replaced, so each wants its reasoning comment
rewritten rather than deleted. `'nothing was started for a reader who is sitting
right here'` was a real argument; what defeats it is that the reader sitting
right here also cannot send a verdict from a `file://` page.

`--host` on `review serve` stays exactly as it is. It is the manual escalation
for an unknown reader who turns out to be remote, and the `serve:` hint already
names it.
