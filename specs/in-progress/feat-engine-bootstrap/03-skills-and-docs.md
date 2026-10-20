---
linear_issue_id: "SKS-398"
---

# Phase 3 — Skills call `bootstrap`; docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** every skill that provisions runs one `bootstrap` call and none runs
printed worktree steps, enforced by an asset test.

## Tasks

- [x] `/spec-start`: provision step runs `git worktree add` as printed, then
      `skitterspec spec-env bootstrap <name>`; relay its step lines
- [x] `/spec`, `/spec-bug`, `/spec-hotfix`: `--docs` provisions run
      `bootstrap <name> --docs`; their full provisions run `bootstrap <name>`
- [x] `/no-spec`: run `bootstrap <name>` after the worktree add
- [x] Update `specs/.core/env.config.md` (`seedFiles`, `docker.envFile`, `setup`)
      and the provisioning paragraph in `spec-planning.md` to say `bootstrap`
      runs them
- [x] Asset test (`assets-bootstrap.test.js`): no provisioning skill tells the
      agent to run the printed `then, in the worktree` commands, and each names
      `spec-env bootstrap`
- [x] Stays-silent test: the exact `bootstrap` invocation each skill uses
      contains no secret-named path token (`.env`, `*.env`), so a
      name-matching secrets hook has nothing to refuse
- [x] Run `pnpm test` — green before the phase is done
