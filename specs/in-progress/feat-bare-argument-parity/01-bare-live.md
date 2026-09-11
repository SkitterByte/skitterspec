---
linear_issue_id: "SKS-145"
---

# Phase 1 — bare `/spec-live` takes when it can tell ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-live` with no argument puts the resolved spec on the running
server when there is exactly one answer and the workbench is free, and prints the
status report unchanged whenever it cannot tell.

## Tasks

- [x] Give `liveGrammar` a no-argument arm in `packages/common/src/cli.js`. It
      currently returns `{ action: 'status' }` outright; it must instead decide
      between `take` and `status`. Keep the existing verb precedence exactly as
      it is — the four verbs and the base branch still match before the
      spec-name fallback, for the reason the comment there already gives.
- [x] **Decide from two positive signals, never from an absence.** Take only when
      (a) a spec resolves without ambiguity — `soleProvisionedSpec` returns
      rather than throwing — **and** (b) the workbench is free:
      `assertPrimaryOnMain` reports `onBase`, and no receipt names a spec. Any
      other state, including any thrown resolution error, falls to `status`.
- [x] Keep the fallback **silent about why** only where the report already says
      it. The status output names the branch, the in-flight spec and the receipt,
      so it explains itself; add a line naming the ambiguity **only** for the
      several-worktrees case, which the report does not cover.
- [x] Do not duplicate the guards. `specEnvLiveTake` already refuses a dirty
      tree, a hotfix, a stateful spec, migrations and a held instance through
      `planTake`. The grammar decides *which verb*, never *whether it is allowed*
      — a second copy of those rules is a second place for them to drift.
- [x] Leave `live status` untouched, including its own zero-arg meaning (the
      repo-wide report). A missing spec after an explicit verb is a different
      question from a missing verb.
- [x] Rewrite the stays-silent guard in
      `packages/common/test/cli-spec-env-zero-arg.test.js` that currently pins
      `live status` — confirm it still asserts the repo-wide report, since that
      behaviour does **not** change, and add a comment saying so explicitly now
      that the sibling case next to it has inverted.
- [x] Add tests in `packages/common/test/cli-spec-env-live.test.js`: bare takes
      the sole provisioned spec; bare takes the spec whose worktree the caller is
      standing in; bare falls back to the status report with several worktrees,
      and says which ones; bare falls back to status when another spec holds the
      instance; bare falls back to status when the primary checkout is off base.
      The last three are the stays-silent cases — each must produce the report,
      not a refusal.
- [x] Run `pnpm test` in `packages/common` and at the repo root — green before
      the phase is done.

## Notes

The failure this phase must not introduce: a bare `/spec-live` typed to *check*
something, which instead switches the primary checkout's branch. That is why the
free-workbench condition is part of the take test rather than left to `planTake`
— when a spec is already live, the honest answer to a bare command is the report
that says so, not a refusal to take.
