---
linear_issue_id: "SKS-398"
---

# Phase 3 — Skills call `bootstrap`; docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every skill that provisions runs one `bootstrap` call and none runs
printed worktree steps, enforced by an asset test.

## Tasks

- [ ] `/spec-start`: provision step runs `git worktree add` as printed, then
      `skitterspec spec-env bootstrap <name>`; relay its step lines
- [ ] `/spec`, `/spec-bug`, `/spec-hotfix`: `--docs` provisions run
      `bootstrap <name> --docs`; their full provisions run `bootstrap <name>`
- [ ] `/no-spec`: run `bootstrap <name>` after the worktree add
- [ ] Update `specs/.core/env.config.md` (`seedFiles`, `docker.envFile`, `setup`)
      and the provisioning paragraph in `spec-planning.md` to say `bootstrap`
      runs them
- [ ] Asset test (`assets-bootstrap.test.js`): no provisioning skill tells the
      agent to run the printed `then, in the worktree` commands, and each names
      `spec-env bootstrap`
- [ ] Stays-silent test: the exact `bootstrap` invocation each skill uses
      contains no secret-named path token (`.env`, `*.env`), so a
      name-matching secrets hook has nothing to refuse
- [ ] Run `pnpm test` — green before the phase is done
