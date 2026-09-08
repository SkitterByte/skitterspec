---
linear_issue_id: "SKS-78"
---

# Phase 1 — Run the configured opener 🔄

> Spec: [00-overview.md](00-overview.md) · **Status:** In progress

**Goal:** handing off no longer makes the operator copy a path — `/spec-go` runs
`open.command` itself, and still stops for the re-run.

## Tasks

- [ ] Amend `packages/common/assets/skills/spec-go/SKILL.md`: at the hand-off,
      **run** the expanded opener `spec-env up` emitted when `open.command` is
      non-empty, then print the worktree path and ask for the re-run. Keep the
      hard stop and the `--here` opt-out exactly as they are.
- [ ] State the empty case in the skill: with `open.command` unset there is
      nothing to run, so print the path and ask the operator to open a session
      themselves — today's wording, unchanged.
- [ ] Do not run an opener in a non-interactive context (no TTY / a scripted
      run) — opening a window nobody is sitting at is noise. Say so in the skill.
- [ ] Note in `packages/common/assets/core/env.config.md` that a non-empty
      `open.command` is now executed at hand-off rather than printed, so an
      operator who wants the old behaviour clears the key.
- [ ] Rebuild dists (`pnpm build`).
- [ ] Add/extend tests covering this phase: assert `spec-go`'s asset tells the
      agent to run the opener, still contains the hard stop and the no-double-
      hand-off guard (the existing `assets.test.js` cases must stay green), and
      covers the empty-`open.command` fallback. Run `pnpm test` — green before
      the phase is done.

## Notes

`config.js:249` already documents an empty `open.command` as "no auto-open",
so this phase makes the loader's stated contract true rather than inventing one.
