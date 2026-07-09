# Phase 4 — Wire-in + docs + opt-in hooks ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** Make the two skills installable and discoverable, keep the registry out
of git, document standalone-vs-Linear adoption, and offer the existing lifecycle
skills a **documented, config-gated opt-in** to provision/teardown — without
hard-wiring anything.

## Tasks

- [x] Register the skills in `src/init.js`: add `spec-env` and `spec-env-down` to
      the `SKILLS` array so `init`/`update` install + symlink them; update the
      "Done. Skills resolve as …" summary line to list them.
- [x] Add `/.spec-env/` to `.gitignore` (machine-local slot registry + backups;
      never committed). Confirm `specs/.core/env.config.json.example` **is**
      tracked while a live `env.config.json` is the consumer's opt-in.
- [x] README: add a short usage note — the two isolation layers (worktree +
      namespaced Docker) plus the optional `open.command`, `/spec-env` /
      `/spec-env-down` usage, the config knobs, and the two adoption modes
      (**standalone**: `linkLinear:false`, plain `{type}/{slug}` branches, pure
      worktree+Docker; **Linear-linked**: branch names fire Linear's GitHub
      automation). Note the consumer's `docker-compose.yml` must reference
      `${PORT_OFFSET}`, and that `open.command` is editor/terminal-agnostic (a
      `warp://` deeplink is one option, not a dependency).
- [x] Opt-in hooks (documented, gated — never forced): in `assets/skills/spec`
      offer to run `/spec-env` after a spec is created; in
      `assets/skills/spec-complete` and `assets/skills/spec-cancel` offer to run
      `/spec-env-down` (respecting guards) so a finished spec reclaims its
      worktree, containers, volumes, and slot. Each hook fires only when
      `specs/.core/env.config.json` is present; otherwise the skills behave exactly
      as today.
- [x] Cross-reference in `assets/rules/spec-planning.md` (or a short new rule):
      note the isolation skills and that they are opt-in and independent of the
      spec lifecycle status.
- [x] Add a test asserting `SKILLS` includes both skills and that
      `init` scaffolds their symlinks (extend the existing init test coverage
      style). Run `npm test` — all green.
- [x] Manual smoke check (documented, not automated): on a real spec, run
      `/spec-env` then `/spec-env-down` end-to-end and confirm worktree, `.env`,
      ports, the `open.command` firing, and clean teardown.

## Notes

Keep the lifecycle-skill touches **surgical and reversible** — a single gated
"offer to …" step, not a behavioural change. The feature must remain fully usable
standalone with `linkLinear:false` and no Linear config present.
