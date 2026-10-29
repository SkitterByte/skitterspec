---
github_issue_id: "#71"
---

# Phase 1 — Script core: parser, check, impact, stale ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `scripts/docs-freshness.js` exists with all three subcommands working
against fixtures, every accusation paired with a stays-silent test, and every
cannot-tell routed to inaction.

## Tasks

- [x] Write `scripts/docs-freshness.js` (CJS, no deps): export a parser that
      reads the `<!-- coverage … -->` block (covers list + verified SHA) from
      an HTML string, returning `{ covers, verified }` or a structured error —
      the validator in phase 2 reuses it.
- [x] Add a minimal glob matcher (`*`, `**`) for matching changed-file lists
      against `covers` — no dependency; cover it with unit tests.
- [x] Implement `check`: scan `specs/backlog/` and `specs/in-progress/`
      overviews for a `> **Docs:**` header; list specs with no line or a bare
      `none`; exit 0 always. Copy gating.js's structural-exclusion comment
      style: a completed spec is out of range by construction, not by filter
      (`.claude/rules/negative-checks.md` rule 2).
- [x] Implement `impact [base]` (default base: the repo's base branch): changed
      files from `git diff --name-only <merge-base>...HEAD` plus uncommitted
      and untracked; list pages whose covers matched a change while the page
      itself did not; exit 0.
- [x] Implement `stale`: per page, `git log --oneline <verified>..HEAD -- <covers>`;
      list pages with hits. An unresolvable `verified` prints
      `cannot tell — <reason>` for that page, never "fresh", and still exits 0.
- [x] Unit tests in `scripts/docs-freshness.test.js` using temp-dir git
      fixtures: each subcommand fires on its positive case, and each has a
      stays-silent test (page edited alongside its code → impact silent;
      `verified` at HEAD → stale silent; completed-bucket spec without a
      header → check silent; spec with `Docs: none: <reason>` → check silent)
      per `.claude/rules/negative-checks.md` rule 3.
- [x] Run `node --test scripts/docs-freshness.test.js` and the full
      `pnpm test` — green before the phase is done.

## Notes

`test-hygiene.test.js` sweeps `scripts/*.test.js` — make sure the new test file
conforms to whatever it asserts before calling the phase done.
