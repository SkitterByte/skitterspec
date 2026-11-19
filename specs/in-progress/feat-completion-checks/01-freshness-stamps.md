---
github_issue_id: "#247"
---

# Phase 1 — Stamps that survive a rebase, and `verify` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `stale` reads a rebased stamp as fresh, and `verify` records a
re-read in one command — proven against a real rebased repo in tests.

## Tasks

- [ ] In `stale`, when `verified` is not an ancestor of HEAD, find the commit
      in `merge-base..HEAD` whose `git patch-id` matches and count from it;
      no match → `cannot tell — verified <sha> was rewritten and no commit on
      HEAD matches it`.
- [ ] Add `verify <page...>`: rewrite each named page's `verified:` to
      `git rev-parse --short=12 HEAD`; refuse an unknown page name, change
      nothing on refusal.
- [ ] Name `verify <page>` beside each page `impact` and `stale` flag.
- [ ] Tests (`scripts/docs-freshness.test.js`): a stamp rebased onto a moved
      base reads fresh; a stamp whose commit was changed by the rebase reads
      cannot-tell (stays-silent: never stale); genuine covered commits after a
      rebased stamp still read stale; `verify` stamps HEAD and refuses unknown
      names. Run `pnpm test`.
