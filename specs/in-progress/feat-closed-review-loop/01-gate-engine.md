---
linear_issue_id: "SKS-262"
---

# Phase 1 — Gate engine: record, verbs, skip ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the engine can arm, report, and disarm a per-spec review gate, with
every disarm on the record — proven by unit tests over the pure functions and
the CLI verbs.

## Tasks

- [ ] Add a gate record to the review sidecar area (beside `.pending.json`,
      gitignored): armed flag, armed-at, the phase that armed it, tree state at
      arming, and an append-only outcome log (verdicts already logged there
      today gain `skip` entries with their reason)
- [ ] Add `spec-env review arm [<spec>]` (called by the phase-end path; keyed
      to the worktree it stands in, same resolution as every other verb)
- [ ] Add `spec-env review gate [<spec>] [--check] [--json]` — human line,
      `--json` for skills, `--check` exits non-zero **only** when armed and
      `review.required` is not `false`; every cannot-tell (no config, no
      registry, unparseable record, not a spec worktree) exits 0 per
      `.claude/rules/negative-checks.md`, with the blind spot named in a
      comment beside the check
- [ ] Add `spec-env review skip "<reason>"` — refuse an empty reason, disarm,
      append the outcome-log entry; next render shows it as history
- [ ] Disarm on a claimed committing verdict (`commit` / `commit-continue`) in
      the existing claim path; leave armed on `changes` and `discuss`
- [ ] Read `review.required` from `env.config.json` (absent → `true`);
      document it in `specs/.core/env.config.md` and the `.example`
- [ ] Unit tests: arm/disarm transitions, skip with and without reason,
      `--check` exit codes including a stays-silent case for every cannot-tell
      branch — green via `pnpm test`

## Notes

The gate record is deliberately separate from the pending-pass store: a pass is
a message in flight, the gate is a standing obligation. Claiming consumes the
pass; only a *committing* verdict or a skip consumes the gate.
