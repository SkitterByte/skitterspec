# Phase 2 — Tear down automatically on a clean completion ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-complete` reclaims the environment without asking once the
branch has landed and the base suite is green, and `--keep-env` opts out.

## Tasks

- [x] Rewrite step 7 of `packages/common/assets/skills/spec-complete/SKILL.md`:
      sub-steps 1–3 (disconnect proxy · `dev down` · `spec-env down`) run
      automatically; drop "offer — don't force" and "On confirmation".
- [x] State the precondition in the step: it runs only when step 6 landed (or
      reported "already landed") **and** the base suite is green. A rebase
      conflict, a work-loss abort or a red suite tears nothing down.
- [x] Keep sub-step 4 (`spec-env prune`) confirm-first, and say why it differs —
      it reaps volumes belonging to other specs, which this spec's clean landing
      says nothing about (Decision 5).
- [x] Add `--keep-env` at the top of step 7: skip 1–3, say the worktree and
      branch are being kept, and name `skitterspec spec-env up <name>` as the way
      back if they change their mind.
- [x] Reword step 6's two "do not offer teardown" lines (rebase conflict,
      work-loss abort) to "do not tear down", so they still read correctly once
      nothing is being offered.
- [x] Leave `/spec-cancel` untouched, and verify the two skills' step 7s are
      allowed to differ — `assets.test.js` treats them as a pair in places
      (`SELF_EDITING`, the provider-neutral test).
- [x] Add tests in `packages/common/test/assets.test.js`: `/spec-complete` step 7
      no longer says "offer — don't force"; it names `--keep-env`; it still
      requires confirmation for `prune`; `/spec-cancel` still offers. Run
      `node --test` — green before the phase is done.

## Notes

Skill text only — the engine already does the right thing, and Phase 1 makes its
branch delete succeed. The two distribution packages' copies under
`packages/skitterspec*/assets/skills/` are build artifacts composed from
`packages/common` and are not tracked, so there is one file to edit.

**Added beyond the plan: step 7 must report what it reclaimed.** Removing the
prompt removed the only place the user learned their worktree was about to go.
Without a closing report, teardown becomes both unannounced and unauthorised —
the one way this change could lose someone their place. A test pins it.

**Confirmed the paired assertions do not block the divergence.** `SELF_EDITING`
and the tracker-seam test treat `/spec-complete` and `/spec-cancel` as a pair,
but both assert commit/seam ordering, not teardown — so the two skills' step 7s
are free to differ. A new test pins `/spec-cancel` still offering, so the
asymmetry is deliberate rather than drift.

`git ls-files '*spec-complete/SKILL.md'` returns one path: the copies under
`packages/skitterspec*/assets/` are untracked build artifacts composed from
`packages/common`.