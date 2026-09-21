# Phase 2 — The two skills declare it ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-bug` and `/spec-hotfix` render with `--buttons fix` for a
single-pass fix and with the committing set for a phased one, and a test holds
them to it.

## Tasks

- [x] `/spec-bug` §5b (`packages/common/assets/skills/spec-bug/SKILL.md`): render
      `skitterspec spec-env review <spec> --buttons fix`, and say in one line
      why — a fix that took one pass has no next phase, so `Commit & Continue`
      would name work that does not exist.
- [x] Add the conditional to `/spec-bug` §5b: where §5 split the fix into phase
      files, drop the flag and take the committing set, because there a next
      phase genuinely exists. Name §5 so the two halves cannot drift.
- [x] `/spec-hotfix` §5b: the same flag, with its own one line — a hotfix is
      single-pass by construction, so it has no phased exception.
- [x] Leave `review arm` in both. The gate is untouched: a phase that ended still
      owes an answer, and `commit` is a committing verdict that discharges it.
- [x] Test: extend `packages/common/test/assets-phase-end-review.test.js` — its
      `RENDERS` list already names both skills — asserting each renders with
      `--buttons fix` and still arms.
- [x] Test (stays silent): `/spec-next` and `/spec-diff` are unchanged — neither
      gains the flag, and `/spec-next`'s §5 note that it passes no `--buttons`
      deliberately must still read the way it does.
- [x] Rebuild the distributions (`node scripts/build-dist.js all`) so both
      shipped skill copies carry the change, and run the project's typecheck and
      test commands — green before the phase is done.

## Notes

The skill text is composed into `packages/skitterspec` and
`packages/skitterspec-linear` at build time; `packages/common/assets/skills/` is
the only copy to edit, and `.claude/skills/` in this repo symlinks the built
Linear one.
