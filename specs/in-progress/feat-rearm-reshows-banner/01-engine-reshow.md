---
github_issue_id: "#83"
---

# Phase 1 — Engine counts re-arms and prints the stack on every 5th ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `spec-env review wait` knows which start this is on its window, and
on every 5th re-arm prints the tier stack and `live:` line read-only. This is
proven by unit and CLI tests.

## Tasks

- [x] Add `waitStarts` to `packages/common/src/env/review.js`. It increments
      and returns the start count for `(spec, since)` in
      `.spec-env/reviews/<spec>.waits.json`, prunes windows older than 12
      hours, and returns `null` on an unreadable store without throwing.
- [x] Build the stack read-only for a waiting spec: reuse `reviewTierStack`
      with the running server's status (no start, stop or restart) and the
      recorded published URL, plus the same `live` answer `review` prints.
- [x] In `specEnvReviewWait` (`cli.js`), add `(re-arm N)` to the start line
      for N ≥ 1, print `re-show: banner (re-arm N)` and the stack when N is a
      positive multiple of the cadence, and add `rearm`/`reshow`/`tiers`/`live`
      under `--json`.
- [x] Add `--reshow-every <n>`: default 5, `0` disables, and a non-number
      takes the default (`negative-checks.md` rule 4).
- [x] Tests: the count increments per window and resets on a new `since`.
      There is a re-show on 5 and 10 and none on 1–4. Stays-silent cases: an
      unreadable store gives no re-show and no throw, the first start (N=0)
      prints no marker, and `--reshow-every 0` never re-shows. The re-show
      path does not touch the serve process (assert no stop or start).
- [x] Run `pnpm test`, and get it green (the repo has no typecheck script).

## Notes

The serve token is stable across restarts (`repoToken`), but re-rendering
still stops the server. The re-show must stay a pure read, so the link open on
a phone is never disturbed.
