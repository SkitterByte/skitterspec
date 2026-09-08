---
linear_identifier: "SKS-70"
linear_url: "https://linear.app/skitterbyte/issue/SKS-70/bug-release-reports-count-spec-bookkeeping-commits-as-shipped-work"
---

# Bug: release reports count spec-bookkeeping commits as shipped work

> **Type:** Bug
> **Name:** bug-release-counts-spec-commits
> **Status:** Complete (2026-09-08)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-08
> **Stack:** worktree
> **Area:** `packages/linear/src/{released,cli-sync,config}.js`

## Symptom

`ticketsInRange` counts a commit's `Refs:` trailer regardless of **what the
commit changed**. A spec's `chore(spec): complete <name>` commit carries the same
ref as the code it describes, but lands *after* the tag that shipped that code —
so the ticket appears in **two consecutive release ranges**: once for its code,
once for its paperwork.

Reported from the `ereqs` project (their spec ERQ-457), reproduced there at tag
`v35.2.1`:

```
$ skitterspec spec-sync released v35.2.0..v35.2.1
  ERQ-171  CI tests across two hosted agents (shard the Test job)
```

ERQ-171's code shipped in `v35.2.0`. Its only commit in this range is
`54157a48 chore(spec): complete feat-ci-test-parallel-shards`, which touches
nothing outside `specs/**`.

**Blast radius, measured by the reporter:** of the last 300 commits on `ereqs`'s
`main`, 22 carried a `Refs:` trailer and **14 of those (64%) were spec
bookkeeping**. This is the dominant case, not an edge case, and it degrades every
"what did this release contain" report — not just their deployment ladder.

Downstream the consequence was a write, not just a bad report: a deployment
ladder move dragged a ticket that had reached `Released` back to `On Test`.

## Root cause

`ticketsInRange` (`packages/linear/src/released.js:62`) folds commits using only
`refsInBody`, and `readCommitRange` (`packages/linear/src/cli-sync.js:952`) reads
the range with `git log --format=%H%x00%s%x00%b%x1e` — **no path information at
all**. Nothing in the pipeline could distinguish a commit that shipped code from
one that only filed paperwork, because the changed paths were never read.

## Failing test (red)

`packages/linear/test/cli-released.test.js` — *"a spec bookkeeping commit does
not put its ticket in the next release"*: commits the code for SKS-1, tags
`v1.0.0`, then commits a `chore(spec): complete` touching only `specs/**`, and
asserts the `v1.0.0..HEAD` report contains no tickets.

Run: `cd packages/linear && node --test test/cli-released.test.js`

With the source fix reverted, 24 tests fail across the four files; the headline
one fails exactly on the reported behaviour:

```
✖ a spec bookkeeping commit does not put its ticket in the next release
  AssertionError: SKS-1 shipped in v1.0.0; its paperwork is not a second release
```

## Fix

- [x] Add `release.ignorePaths` config (default `["specs/"]`), validated like
      `release.stages` — a non-array or blank entry is a hard error, `[]` is the
      opt-out, and `releaseIgnorePaths()` defaults an older config object rather
      than silently disabling the filter.
- [x] Add `onlyIgnoredPaths(paths, ignorePaths)` in `released.js` — a **positive**
      signal: yes only when it actually saw paths and every one is under an
      ignored prefix. Prefix matching is on path boundaries, so `specs/` never
      swallows `specs-archive/`.
- [x] Teach `ticketsInRange` to skip such commits and report them as a new
      `ignored` count, rather than silently subtracting them.
- [x] Add `readChangedPaths` in `cli-sync.js` — a **second** `git log -z
      --format=%x1e%H --name-only`, not `--name-only` on the existing call: that
      format is NUL-delimited so a body cannot split a record, and appending a
      file list to the same stream would put one commit's files inside the next
      commit's record. `-z` also stops git C-quoting non-ASCII filenames.
- [x] Wire it through both `released` and `stage`, disclosing the ignored count
      in the text report and in `--json`.
- [x] Failing tests now pass (GREEN); `pnpm -r test` → **1196 passing, 0
      failing** (564 linear, 420 common, 212 sync-core).
- [x] Document `release.ignorePaths` in `linear.config.md`, the shipped
      `linear.config.json.example`, and the `spec-sync` skill.

### Why the unknown case counts rather than vanishes

Per `.claude/rules/negative-checks.md` rule 4, the "cannot tell" branch routes to
inaction. Verified empirically rather than assumed: **git lists no files for a
merge commit** (without `-m`), nor for an empty one, and a failed `git log`
yields no paths for anything. Phrased as "no unignored path was found", every one
of those would silently drop that commit's ticket from its release. Over-claiming
a ticket gets noticed when someone looks for it; a ticket belonging to no release
never does. (The root commit turned out **not** to be a blind spot — `--name-only`
does list its files — so that claim was removed from the comment rather than left
in as a false caveat.)

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-sync released` — excludes bookkeeping; reports `ignored` |
| CLI command | update | `spec-sync stage` — no longer moves a paperwork-only ticket |
| Config key | add | `release.ignorePaths` (default `["specs/"]`) |
| Skill/rule | update | `spec-sync` SKILL.md — relay the ignored count |

## Verification on real history

Filter on vs off across this repo's own history — 53 paperwork commits set aside
across 123 commits, **zero tickets lost**, because every ticket also has a code
commit in its own range:

| Range | Commits | Ignored | Tickets lost |
|-------|---------|---------|--------------|
| `skitterspec@16.7.0..16.8.0` | 43 | 18 | none |
| `skitterspec@16.4.0..16.8.0` | 123 | 53 | none |

## Open questions

- The reporter also asked whether `stage` should **refuse** a backwards move
  rather than warn (`stageOrderWarning`). Left as a warning: a rollback and a
  hotfix going straight to prod are both legitimate, and this fix removes the
  mechanism that caused the observed regression. Worth revisiting when `ereqs`
  drops its local guard (ERQ-458), since this then becomes the only defence.
- Interaction flagged by the reporter (their ERQ-461): a spec still in
  `backlog`/`in-progress` at tag time is excluded by `partitionStageMoves` as
  `unfinished`, and was previously rescued by the next release via exactly the
  bookkeeping commit this now ignores. Deliberately **not** changed here —
  `ereqs` is handling its half with a version label. Noted so the combination is
  a choice rather than a surprise.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-08 | In Progress | in-progress | Reuben Greaves |
| 2026-09-08 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-08 — Bug reproduced from the `ereqs` handoff; 25 tests added across the
  pure, config and CLI layers; red confirmed by reverting the source fix (24
  failures).
- 2026-09-08 — Fixed: commits whose changed paths are all under
  `release.ignorePaths` no longer contribute tickets; test green.
- 2026-09-08 — Completed; all phases done, tests green (1196 passing). The
  `stage` backwards-move question and the ERQ-461 interaction are recorded under
  Open questions as deliberate non-changes.
