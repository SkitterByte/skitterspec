---
linear_issue_id: "SKS-262"
---

# Phase 1 — Gate engine: record, verbs, skip ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the engine can arm, report, and disarm a per-spec review gate, with
every disarm on the record — proven by unit tests over the pure functions and
the CLI verbs.

## Tasks

- [x] Add a gate record to the review sidecar area (`<page>.gate.json`, beside
      `.pending.json`, gitignored): armed flag, armed-at, the phase that armed
      it, and an append-only outcome log of skips and verdicts
- [x] Add `spec-env review arm [<spec>] [--phase <n>]` (called by the phase-end
      path; same resolution as every other verb) — idempotent within a phase
- [x] Add `spec-env review gate [<spec>] [--check] [--json]` — human line,
      `--json` for skills, `--check` exits non-zero **only** when armed and
      `review.required` is not `false`; every cannot-tell (no config, no
      registry, unparseable record, not a spec worktree) exits 0 per
      `.claude/rules/negative-checks.md`, with the blind spot named in a
      comment beside the check
- [x] Add `spec-env review skip "<reason>"` — refuse an empty reason, disarm,
      append the outcome-log entry (readable via `gate --json`)
- [x] Disarm on a claimed committing verdict (`commit` / `commit-continue`) in
      the existing claim path; leave armed on `changes`, `discuss`, and a
      refused commit
- [x] Read `review.required` from `env.config.json` (absent → `true`);
      document it in `specs/.core/env.config.md` and the `.example`
- [x] Unit tests: arm/disarm transitions, skip with and without reason,
      `--check` exit codes including a stays-silent case for every cannot-tell
      branch — green via `pnpm test` (2415 passed)

## Notes

The gate record is deliberately separate from the pending-pass store: a pass is
a message in flight, the gate is a standing obligation. Claiming consumes the
pass; only a *committing* verdict or a skip consumes the gate.

Two deviations from the plan, both recorded in the overview Changelog:

- **The skip log lives in the gate record, not the notes `decisions` log.** The
  page's `drawLog` maps any verdict it does not recognise to "discussed", so a
  `skip` written there would render as a lie on the next page. Showing the gate
  log on the page is phase 2's work, and is listed there.
- **No tree state is recorded at arming.** It was in the plan so the gate could
  lapse when the tree moved on — but that is the bypass, not a safeguard: the
  act of continuing to work would clear the obligation. The gate is cleared by
  a decision or not at all, and `skip` is the one-command exit.
