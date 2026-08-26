# Phase 3 — Wire into `/spec-complete` & `/spec-cancel` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** Every spec finish also sweeps orphaned test-DB volumes — the reaper
runs (confirm-first) from `/spec-complete` and `/spec-cancel`, so the leak can't
re-accumulate.

## Tasks

- [x] In `packages/common/assets/skills/spec-complete/SKILL.md` teardown section
      (7), after the current spec's `spec-env down`, added step 4: run
      `skitterspec spec-env prune`, show the orphan report, and execute the
      printed `docker volume rm` commands **only on explicit user confirmation**.
      Confirm-first, non-fatal, only when `env.config.json` exists.
      (Source of truth is `assets/`, not the installed `.claude/skills/` copy.)
- [x] Mirror the same step into
      `packages/common/assets/skills/spec-cancel/SKILL.md` teardown (step 4).
- [x] Update `spec-planning.md` engine list →
      `<up|down|prune|dev|connect|integrate|hotfix>` + note complete/cancel reap
      orphans.
- [x] Document the subcommand in `env.config.md` — new "Pruning orphaned test-DB
      volumes" section: what an orphan is, worktree-based liveness, `--older-than`,
      no backup. Also updated its engine list.
- [x] Run `node --test` — **416/416 green**. Ran `node scripts/build-dist.js all`
      to confirm `prune.js` + the skill/doc edits vendor into both dist packages
      and the dist CLI loads. (Real orphan-volume dry-run already done in Phase 2.)

## Notes

Keep the wiring **confirm-first** and non-fatal: a prune failure (e.g. docker
unavailable) must not block the spec from completing/cancelling — surface it and
carry on. Only the `packages/common/assets/**` copies are tracked; the
`skitterspec` / `skitterspec-linear` copies are **build-generated** (gitignored),
vendored by `scripts/build-dist.js` — no manual mirroring needed.
