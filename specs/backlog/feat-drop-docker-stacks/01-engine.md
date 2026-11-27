---
github_issue_id: "#343"
---

# Phase 1 — Engine stops provisioning Docker; config tolerates the old keys ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** no engine path builds, starts or tears down a Docker stack. Old
configs and headers load with a notice, and tests prove both.

## Tasks

- [ ] `resolve.js`: make `specStack`/`resolveStack` always answer worktree. A
      `Stack:` value naming docker returns a notice. Drop `projectName` from
      the resolved spec.
- [ ] `provision.js`: remove the compose step, the `composeArgs` helper, and
      `.env` rendering for Docker (`render.js`'s COMPOSE_PROJECT_NAME). Keep
      the `.env` seeding that `bootstrap` does for non-Docker reasons, if any.
- [ ] `teardown.js`: remove the volume drop, `--keep-volumes` and
      `backupCommand`. `prune.js` and `hotfix.js`: remove the "holds a Docker
      stack" checks.
- [ ] `registry.js` / `dev.js`: read the port block from `ports.base` and
      `ports.perSpec`, falling back to `docker.portBase` and
      `docker.portsPerSpec` with a notice. Update the slot comments.
- [ ] `config.js`: remove `docker` from `DEFAULT_CONFIG` and the parser, add
      `ports`, and print one deprecation notice when a `docker` key is
      present. Route it through `deprecate.js` if that is where such notices
      live.
- [ ] `live.js`: remove the `Stack: docker` refusal (check 5) and its ctx
      field.
- [ ] `cli.js`: remove the Docker branches from `up`, `down`, `status` (the
      `slot … ports` line keeps using the new keys) and `prune`, and remove
      the `--keep-volumes` flag.
- [ ] Update or delete the Docker cases in `env-provision`, `env-teardown`,
      `env-prune`, `env-resolve`, `env-config`, `env-hotfix`, `env-live`,
      `env-registry` and the `cli-spec-env-*` tests.
- [ ] Add stays-silent tests (`.claude/rules/negative-checks.md` rule 3): a
      config with no `docker` key prints no notice, and a `Stack: worktree`
      header prints none.
- [ ] Run `pnpm build` and `pnpm test` until green.

## Notes

The `docker.backupCommand` in this repo's own `specs/.core/env.config.json`
goes too, in this phase's commit.
