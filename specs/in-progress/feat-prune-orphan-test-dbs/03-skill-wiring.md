# Phase 3 — Wire into `/spec-complete` & `/spec-cancel` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** Every spec finish also sweeps orphaned test-DB volumes — the reaper
runs (confirm-first) from `/spec-complete` and `/spec-cancel`, so the leak can't
re-accumulate.

## Tasks

- [ ] In `.claude/skills/spec-complete/SKILL.md` teardown section (7), after the
      current spec's `spec-env down`, add a step: run `skitterspec spec-env
      prune`, show the orphan report, and execute the printed `docker volume rm`
      commands **only on explicit user confirmation**. Opt-in / only when
      `env.config.json` exists, matching the surrounding steps.
- [ ] Mirror the same step into `.claude/skills/spec-cancel/SKILL.md` teardown.
- [ ] Update `packages/common/assets/rules/spec-planning.md` (and any mirrored
      `assets/` copies) to mention `spec-env prune` in the `spec-env
      <up|down|dev|connect|integrate|live>` engine list, and note complete/cancel
      now reap orphans.
- [ ] Document the subcommand in `packages/common/assets/core/env.config.md` (or
      the relevant engine doc) — what an orphan is, the worktree-based liveness
      rule, `--older-than`, and that no backup is taken.
- [ ] Run `node --test` (skills are markdown, but doc/asset-sync tests may guard
      the mirrored copies) — green before the phase is done. Manually dry-run
      `spec-env prune` in a scratch repo with a fake orphan volume to confirm the
      report + confirm-first flow.

## Notes

Keep the wiring **confirm-first** and non-fatal: a prune failure (e.g. docker
unavailable) must not block the spec from completing/cancelling — surface it and
carry on. `assets/` copies are vendored into `skitterspec` and `skitterspec-linear`
(byte-identical); keep them in sync or let the build/sync step regenerate them.
