---
linear_issue_id: "SKS-316"
---

# Phase 2 — One URL shape, whatever the bind ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the served URL for a repo is the same string whether the reader is
detected as local, remote or unknown — so a detection flip mid-session cannot
change the address someone is holding.

## Tasks

- [x] Carry the token on **every** bind, replacing
      `const token = loopback ? null : reuseToken || mintToken()`. A loopback
      URL gains a path segment it does not strictly need, and gains a shape that
      does not change.
- [x] **Say why the segment is there on loopback**, since it guards nothing at
      that bind: it exists so the URL survives the reader detection flipping,
      which happened inside a single session (`unknown` → `remote`) and changed
      the URL underneath a reader.
- [x] Check the route parser treats a tokened loopback path exactly as it treats
      a tokened network path — `routeFor` is pure, so this is a test rather than
      a change if it already does.
- [x] Tests: the same repo yields the same URL under `reader: local`,
      `reader: remote` and `detect`-with-no-signal; only the host differs.
- [x] **Stays-silent test** (rule 3): the token still guards a non-loopback
      bind — a wrong token is `notfound` and never a redirect, exactly as now.
      Widening where the token appears must not weaken what it does.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

This phase is what makes the reader detection harmless. `feat-every-render-serves`
already stopped detection deciding *whether* to serve; this stops it deciding
what the URL looks like. What it still decides — the bind — is the one thing it
should, because that is a fact about reachability rather than about addressing.

**`routeFor` needed no change**, which the plan allowed for: it already treats a
tokened path identically whatever the bind, so that task became a test. The
stays-silent assertion is the one that matters there — widening *where* the
token appears must not weaken *what* it does, and a wrong token is still
`notfound` rather than a redirect.

**The pinned literal in `env-serve-version` moved twice in one spec**, once per
phase, and both times its reasoning was the thing that had gone stale rather
than the assertion. It now also asserts the **absence** of the old
`loopback ? null :` form, so reintroducing the bind condition fails rather than
quietly passing a regex that only checks for what is there.
