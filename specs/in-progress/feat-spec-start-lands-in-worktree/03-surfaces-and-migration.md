---
linear_issue_id: "SKS-180"
---

# Phase 3 — Sweep the shipped surfaces and the migration note ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every shipped surface describes a start that lands you in the worktree,
and an upgrader is told their session will now move.

## Tasks

- [ ] Update `packages/common/assets/rules/spec-planning.md:48` — it currently
      says `/spec-start` "**tells you the path**, and then asks: build phase 1
      now, or hand off? Your session never moves either way." Both halves change.
- [ ] Update `packages/common/README.md:139` — "**It builds the branch there and
      prints the path** — your session never moves" — and the hand-off sentence
      that follows it at line 143.
- [ ] Check `packages/common/assets/core/env.config.md` for the same claim and
      update it if present; it is in the one-path test's `SURFACES` set, so a
      miss there fails that test rather than shipping.
- [ ] Add the behaviour change to the **pending** `MIGRATION.md` entry for the
      unreleased major, under a heading an upgrader will read: starting a spec
      now moves the session into the worktree, so `/spec-next` needs no argument
      and a shell that was on `main` will not be afterwards.
- [ ] Extend the `SURFACES` set in
      `packages/common/test/assets-spec-start-one-path.test.js` if this phase
      touches a shipped file not already in it — that set exists because the last
      sweep was caught by a completion pass rather than a test.
- [ ] Rebuild the composed distributions (`node scripts/build-dist.js all`). The
      self-hosted `.claude/` install symlinks into `packages/*/assets/`, so it
      needs no resync; `dev-sync` is for consumer projects.
- [ ] Run `scripts/docs-claims.test.js` and `scripts/migration-guide.test.js`
      early rather than at the end — both assert on the docs this phase edits.
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

Compose in memory from the source when asserting on distribution output —
`packages/skitterspec*/assets/` is gitignored build output, so reading it makes a
test pass for whoever just ran a build and fail on a fresh clone.

`docs/index.html` is worth a grep for the same claim, but only edit it if it is
actually there — this spec should not turn into a docs rewrite.
