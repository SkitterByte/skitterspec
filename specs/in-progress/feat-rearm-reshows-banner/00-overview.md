---
github_identifier: "#82"
github_url: "https://github.com/SkitterByte/skitterspec/issues/82"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# Re-show the review banner on long waits

> **Type:** Feature
> **Name:** feat-rearm-reshows-banner
> **Status:** In Progress — Phase 1 (started 2026-10-31)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-31
> **Area:** packages/common/src/env/review.js, packages/common/src/cli.js, packages/common/assets/rules/spec-reports.md, packages/common/assets/skills/{spec,spec-next,spec-bug,spec-diff,no-spec}/SKILL.md, docs/review.html, docs/reference.html
> **Stack:** worktree
> **Docs:** review, reference

## Problem

A review left waiting for a long time is re-armed every time the harness
kills its wait, and each re-arm leaves a trace in the transcript, usually a
tool call plus a "still waiting on…" line, even though the rule says re-arms
are silent. A reader who comes back after an hour finds a long column of
those, with the verdict line and the banner's links scrolled far up the page.
They have to scroll to find the URL that would let them answer. The prose
"say nothing" rule is not holding, and nothing brings the links back down.

## Decisions

1. **Re-show on every 5th re-arm, counted rather than timed.** What buries the
   banner is the number of re-arms, not the time between them. A death every
   5 minutes and one every 45 scroll the page the same distance per re-arm.
   This is not the count `spec-reports.md` rejects: there a count was a
   *bound* on how long to keep waiting, and the 12-hour age bound stays
   exactly as it is. Re-show every time was rejected because a banner on every
   re-arm teaches the reader to scroll past banners.
2. **Repeat the verdict line and the banner, not the table.** The one-line
   verdict (`✅ **Phase 2 built** — feat-x, 2 of 4`) says what is waiting, and
   the banner gives counts, all three tiers, the `live:` line, the holding line
   and the exits. The table is not repeated, because the contract forbids a
   second block. Where the verdict line is no longer in context (after a
   compaction), it is dropped rather than reconstructed.
3. **The engine counts, and supplies the stack.** `review wait` records each
   start on a `(spec, --since)` window in the gitignored review store. On
   re-arms 5, 10, 15 and so on, it prints a `re-show:` marker followed by the
   tier stack and `live:` line, built read-only from the running server's
   status and the published URL. It does not re-render the page or restart
   the server. A count kept in prose would not survive `/clear` or
   compaction, and a stack the model copies from earlier would drift. The
   rule is still that the stack is the engine's and is copied.
4. **Between re-shows, a re-arm produces no text at all.** The tool call is
   the whole turn. The only text a re-arm may produce is the periodic re-show.
   This tightens the existing "say nothing" wording, which has been read as
   permitting a one-line status.
5. **The banner stays the banner.** A re-show is the existing banner shape,
   from `spec-reports.md`, in its current state. Past the 12-hour bound that
   is the degraded `/spec-reviewed` sentence. It is a repeat of an existing
   control, not a new shape, so the "two controls may follow the block" rule
   needs no third control. This is recorded in `spec-reports.md` as a
   clarification of the re-arm section, not as an amendment to the banner.
6. **The count is per window, and cannot-tell means no re-show.** A store that
   is unreadable or missing gives no count, so nothing is re-shown. That is
   the harmless branch (`negative-checks.md` rule 4): the reader loses one
   reminder, not a verdict. A new `--since` starts a new count.

## Solution overview

- `waitStarts(store, spec, since)`, a pure function in `review.js`: it
  increments and returns the start count for a window. It is held in
  `.spec-env/reviews/<spec>.waits.json`, keyed by `since`, and windows older
  than the 12-hour bound are pruned on write.
- `spec-env review wait` calls it before the first poll. The start line gains
  `(re-arm N)` when N ≥ 1. When N is a positive multiple of 5, stdout also
  carries:

  ```
    re-show: banner (re-arm 5)
    local:   http://127.0.0.1:7760/…
    network: http://192.168.0.136:7760/…
    remote:  off — /spec-remote-review
    live: off — /spec-live to put it live
  ```

  `--json` carries `{ rearm: N, reshow: true|false, tiers, live }`.
  `--reshow-every <n>` overrides 5, and `0` disables it.
- The skills' re-arm paragraph (one shared sentence per waiter) says: relay a
  `re-show:` as the verdict line plus the banner, and otherwise end the turn
  with no text.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env review wait` — `(re-arm N)` on start line, `re-show:` + stack every 5th, `--reshow-every <n>` |
| Config/store | add | `.spec-env/reviews/<spec>.waits.json` (gitignored start counts per window) |
| Domain function | add | `waitStarts` in `review.js`; read-only stack lookup reusing `reviewTierStack` |
| Skill/rule | update | `spec-reports.md` re-arm section: strict silence + periodic re-show |
| Skill/rule | update | re-arm sentence in spec, spec-next, spec-bug, spec-diff, no-spec |
| Docs | update | `docs/review.html` (waiting), `docs/reference.html` (wait flags) |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Engine counts re-arms and prints the stack on every 5th | ✅ | [01-engine-reshow.md](01-engine-reshow.md) |
| 2 | Rule and skills relay the re-show; silence between | ⬜ | [02-rule-and-skills.md](02-rule-and-skills.md) |

## Open questions

- None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-31 | Ready | backlog | Reuben Greaves |
| 2026-10-31 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-10-31 — Spec created, from a long idle review where the banner was
  scrolled away under a column of re-arm lines.
- 2026-10-31 — Phase 1 done: `recordWaitStart`/`reshowDue` in review.js,
  read-only `readRunningReviewServer` + `reshowStack` in cli.js, and
  `--reshow-every`. 9 new tests. The repo has no typecheck script, so
  `pnpm test` (4168 passing) is the gate.
- 2026-10-31 — Observed while authoring: the harness requires visible text
  after a monitor event, so decision 4's "no text at all" may only be
  achievable as one fixed short line. Settle this in phase 2.
