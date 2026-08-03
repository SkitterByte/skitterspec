# Phase 3 — CLI detection, prompt, flags + /spec-init docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `init` on an existing setup routes to resync / reset / leave (interactive
prompt or flags), the non-interactive default stays create-missing, and the
behaviour is documented — proven by CLI-parse + integration tests.

## Tasks

- [ ] `cli.js` parse: add `--resync` and `--reset`; keep `--force`, `--yes`,
      `--isolation`, and the `update` command. Refresh `HELP`.
- [ ] `init` dispatch: if `isExistingSetup(dir)` —
      - interactive (TTY, no `--yes`, no action flag) → prompt {Resync, Start
        again, Leave alone} (default **Leave alone**); **Start again** asks a
        second confirm before `reset`.
      - `--resync` → `resync`; `--reset` → `reset` but only with `--yes` (else
        refuse with a message); `--force` → `resync` with overwrite.
      - non-interactive, no action flag → **create-missing** (today's behaviour).
      Fresh repo (not `isExistingSetup`) → unchanged install.
- [ ] Map the `update` command onto `resync` (backward-compatible); keep its
      release-tooling cleanup.
- [ ] Add a `prompts.js` helper for the 3-way choice + the reset confirm.
- [ ] Update `packages/common/assets/skills/spec-init/SKILL.md` to describe the
      re-run behaviour (detect → resync/reset/leave; manifest; safety guard).
      Rebuild the vendored dists (`node scripts/build-dist.js all`).
- [ ] Tests: parse recognises the new flags; `--reset` without `--yes` is refused;
      non-interactive existing-setup run creates-missing only; `update` resyncs.
      Full suite green; assets test still sees the spec-init skill.

## Notes

Prompts must be non-blocking in CI (no TTY) — mirror the existing `promptSetup`
gating (`process.stdin.isTTY && !opts.yes`). Default the interactive choice to the
safest (Leave alone) so an accidental `init` + Enter changes nothing.
