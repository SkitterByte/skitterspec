---
linear_issue_id: "SKS-40"
---

# Phase 2 — `spec-sync released` — a release's ticket list ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-sync released <range>` reports the deduped tickets in a commit
range, and how many commits carry no ref, proven against a fixture repo with real
git history.

## Tasks

- [ ] Add `packages/linear/src/released.js` with a pure
      `ticketsInRange(commits)` → `{ tickets, unreferenced, total }`: parse
      `Refs:` trailers, dedupe preserving first-seen order, and count commits
      carrying none. No git, no network — the caller supplies the commits.
- [ ] Add `spec-sync released <range> [--json]` to `cli-sync.js`: read the range
      with `git log --format=%H%x00%s%x00%b`, hand it to `ticketsInRange`, and
      print the report. Refuse a range git cannot resolve, naming it.
- [ ] Enrich with issue titles **only** when the API transport is available: one
      `readIssue` per distinct ticket. On the MCP path, or with no key, or on a
      read failure, print bare refs and say titles were unavailable — never fail.
- [ ] Report the unreferenced count explicitly, even when it is zero: staying
      silent about it reads as "everything is accounted for", when a missed
      trailer and a legitimately ticketless chore commit look identical.
- [ ] Accept the same range forms git does (`A..B`, a bare tag, `HEAD~5..`), and
      default to `<last tag for this package>..HEAD` when no range is given —
      reusing `lastTagFor` from `scripts/release.js` rather than a second guess
      at the tag scheme.
- [ ] Add `packages/linear/test/cli-released.test.js` over a fixture repo with
      real git: commits with refs, duplicates across commits deduped, commits
      with none counted, a trailer in the body rather than the subject, and a
      `Refs:` inside a code block or quoted line **not** counted.
- [ ] Add a unit test for `ticketsInRange` covering the parse cases without git.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

Dedupe order matters for readability: a release touching one ticket across eight
commits should list it once, where it first appears, not eight times.

The "not counted" cases in the test are the accusing half of this report — a
`Refs:` line quoted inside a commit body (say, a commit that *discusses* the
convention) must not be read as that commit belonging to the ticket, or a release
claims work it does not contain.
