---
github_issue_id: "#72"
---

# Phase 2 — Coverage blocks on every page + the validator ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** all 7 `docs/*.html` pages carry a true coverage block, and a
build-failing validator keeps every block well-formed and every glob alive.

## Tasks

- [x] Read each page (`index`, `review`, `reference`, `linear`, `github`,
      `jira`, `azure-boards`) and write its `covers` globs mapping to the real
      code it describes (engine modules, skills, provider packages). Verify
      every glob matches tracked files before writing it.
- [x] Set each page's `verified` to the current HEAD SHA — the blocks are being
      written by someone who just read the pages, which is what `verified`
      records.
- [x] Add the validator to `scripts/docs-freshness.test.js`: every
      `docs/*.html` has a coverage block, it parses, `covers` is non-empty,
      `verified` looks like a SHA, and **each glob matches at least one
      git-tracked file** — any failure fails `node --test`. Name the blind spot
      beside the dead-glob check (rule 2), and pair it with a stays-silent test
      over the real pages (rule 3).
- [x] Update `docs/README.md`: fix the stale "four pages" table (it omits
      `azure-boards.html`), and extend the "verified by test, not by a version
      note" paragraph — `verified` is a machine-read watermark for the stale
      report, never a displayed claim, so it ages productively instead of
      rotting.
- [x] Run `pnpm test` — green, including `docs-claims.test.js` (the comment
      block must not break any of its page assertions).

## Notes

`reference.html` spans every package — broad globs are fine there; the point is
that a change *somewhere relevant* flags a re-read, not precision.
