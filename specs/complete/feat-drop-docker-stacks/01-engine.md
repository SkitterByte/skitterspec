---
github_issue_id: "#343"
---

# Phase 1 — Engine stops provisioning Docker; config tolerates the old keys ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** no engine path builds, starts or tears down a Docker stack. Old
configs and headers load with a notice, and tests prove both.

## Tasks

- [x] `resolve.js`: make `specStack`/`resolveStack` always answer worktree. A
      `Stack:` value naming docker returns a notice. Drop `projectName` from
      the resolved spec.
- [x] `provision.js`: remove the compose step, the `composeArgs` helper, and
      `.env` rendering for Docker (`render.js`'s COMPOSE_PROJECT_NAME). Keep
      the `.env` seeding that `bootstrap` does for non-Docker reasons, if any.
- [x] `teardown.js`: remove the volume drop, `--keep-volumes` and
      `backupCommand`. `prune.js` and `hotfix.js`: remove the "holds a Docker
      stack" checks.
- [x] `registry.js` / `dev.js`: read the port block from `ports.base` and
      `ports.perSpec`, falling back to `docker.portBase` and
      `docker.portsPerSpec` with a notice. Update the slot comments.
- [x] `config.js`: remove `docker` from `DEFAULT_CONFIG` and the parser, add
      `ports`, and print one deprecation notice when a `docker` key is
      present. Route it through `deprecate.js` if that is where such notices
      live.
- [x] `live.js`: remove the `Stack: docker` refusal (check 5) and its ctx
      field.
- [x] `cli.js`: remove the Docker branches from `up`, `down`, `status` (the
      `slot … ports` line keeps using the new keys) and `prune`, and remove
      the `--keep-volumes` flag.
- [x] Update or delete the Docker cases in `env-provision`, `env-teardown`,
      `env-prune`, `env-resolve`, `env-config`, `env-hotfix`, `env-live`,
      `env-registry` and the `cli-spec-env-*` tests.
- [x] Add stays-silent tests (`.claude/rules/negative-checks.md` rule 3): a
      config with no `docker` key prints no notice, and a `Stack: worktree`
      header prints none.
- [x] Run `pnpm build` and `pnpm test` until green.

## Notes

The `docker.backupCommand` in this repo's own `specs/.core/env.config.json`
goes too, in this phase's commit.

- The deprecation notice lives in `config.js` (`DEPRECATED_KEYS`, reported
  beside the unknown-key advisory), not `deprecate.js`, which retires
  installed assets rather than config keys.
- The hotfix finish guard was reworded, not removed: a registry slot is now a
  dev port block that only `spec-env down` frees.
- `spec-env prune` survives as the stale review-server pidfile reap.
  `--keep-volumes` and `--older-than` are accepted and ignored.
- `env.config.json.example` got `ports` in place of `docker` here, because the
  example-config test needs it to be green. `docs/review.html` lost its dead
  `render.js` covers glob for the same reason.
