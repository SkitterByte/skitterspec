---
linear_issue_id: "SKS-238"
---

# Phase 1 — The engine reads the phase index ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the engine can say whether a spec has an unfinished phase left, and the
page data carries the answer — with "cannot tell" as a real third outcome.

## Tasks

- [x] Add a phase reader to the base engine: list the spec folder, take the
      `NN-*.md` files, exclude the overview. The Linear provider already does
      exactly this discovery (`packages/linear/src/cli-sync.js`) — follow its
      shape rather than inventing a second one, but keep it in `common`, since
      the page must work with no provider installed.
- [x] Read each phase's **status** from the file it lives in — the
      `> **Status:**` line, with the heading's `⬜`/`🔄`/`✅` as the fallback.
      Prefer the line: it is prose a human wrote deliberately, where the emoji is
      decoration that a careless edit drops.
- [x] Return `{ total, done, hasNextPhase }`, and **`null` when it cannot tell** —
      a legacy bare `<name>.md`, an overview carrying inline phases, a folder the
      render cannot see. Three outcomes, not two
      (`.claude/rules/negative-checks.md` rule 4).
- [x] Find the spec folder in **any bucket**. A page is rendered for specs in
      `in-progress/` and for finished ones in `complete/`, and a reader that only
      looked in one would report `null` for the very case this spec is about.
- [x] Read from the **worktree**, not the primary checkout: the spec's own branch
      is where its phase statuses are current, and on the base branch an
      in-flight spec still reads as it did before it started.
- [x] Carry it into `collectReview`'s output as `phases`, beside `notes`, and
      **only when it could be read** — absent stays absent, so a render of a
      spec this cannot parse is byte-identical to today's.
- [x] Tests: `hasNextPhase` is true mid-spec, false on the last phase, false when
      every phase is done; a legacy layout answers `null`; a spec in `complete/`
      is found; the reader reads the worktree's copy.
- [x] **Stays silent:** a spec it cannot parse adds no key to the page data and
      changes no output (`.claude/rules/negative-checks.md` rule 3).
- [x] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

The status line wins over the emoji deliberately. Both are written by the
lifecycle skills and both are kept in sync, but a hand edit that fixes one and
forgets the other is far likelier to leave a stale emoji than stale prose — and
the emoji is what a reader's eye skips.
