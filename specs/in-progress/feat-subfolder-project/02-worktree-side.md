---
github_issue_id: "#142"
---

# Phase 2 — Worktree side ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a provisioned worktree is used at `<wt>/<prefix>` for everything
project-scoped — proven by nested up/bootstrap/dev/handoff tests.

## Tasks

- [ ] Route `<worktree>/specs/…` builders through `projectIn`: cli.js
      `specEnvHandoff` (~2522) and ~2583, env/review.js (~453), and any other
      `join(worktree, 'specs'…)`
- [ ] Run `setup`, dev servers, `docker.composeFile`, env/seed-file copies and
      the registry against `projectIn(<wt>)`; leave git operations at the
      worktree root
- [ ] Make the folder `up`/`handoff` tells the session to `cd` into
      `projectIn(<wt>)`; check the spec-start / spec / no-spec skill text says
      "the path the engine prints", not a hand-built one
- [ ] Look up specs in a worktree at `projectIn(<wt>)` (resolve.js
      `findSpecFolder` search dirs, inflight.js `read`)
- [ ] Move `cli-spec-env-status`, `-zero-arg` and `-up-from` tests (and the
      up/bootstrap/dev/handoff ones) onto `test/helpers/repo.js`
- [ ] Tests: nested up → bootstrap → dev → handoff on a fixture; prefix `''`
      unchanged; typecheck + test + `test:nested` green
