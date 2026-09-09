---
linear_issue_id: "SKS-106"
---

# Phase 2 — `open.command` becomes the fallback opener ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the opener runs only when the in-session switch did not happen, the
docs say so, and this repo stops spawning a tab.

## Tasks

- [ ] Move the `open.command` and `/add-dir <trusted root>` instructions in
      `spec-start/SKILL.md` onto the hand-off branch from phase 1 — neither
      applies once the session is the worktree.
- [ ] Update the `open` block comment in
      `packages/common/assets/core/env.config.md:127-138`: it currently says
      "`/spec-start` RUNS it when it hands you into a new worktree". Say it is the
      **fallback** opener — run when the session could not be switched in place —
      and keep the existing "empty = nothing is opened" and non-interactive notes.
- [ ] Leave `env.config.json.example` and the config schema alone: `open.command`
      already defaults to `""` (`packages/common/src/env/config.js:89`) and its
      role, not its shape, is what changes.
- [ ] Set `open.command` to `""` in this repo's `specs/.core/env.config.json`,
      replacing `open -a Warp {worktreePath}`.
- [ ] Add a prose test asserting the skill runs the opener only on the hand-off
      branch — i.e. that the opener is not described as an unconditional step.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

The engine keeps expanding `openCommand` into the printed plan
(`packages/common/src/env/provision.js:231`) regardless — it is the skill that
decides whether to run the printed line. No engine change.
