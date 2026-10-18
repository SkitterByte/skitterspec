---
linear_issue_id: "SKS-388"
---

# Phase 1 — Reorder the plan, env file as a command ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** for a Docker-escalated spec, `spec-env up` prints seeds, then the env
file, then setup, then `docker compose … --env-file <envFile> up -d`, all in the
worktree. Proven by `env-provision` and `cli-spec-env-up` tests, red first.

## Tasks

- [ ] Write the failing tests first, in `packages/common/test/env-provision.test.js`:
  - No `commands` entry starts with `docker compose`.
  - `dockerCommands[0]` carries the `worktreeCd` guard, `--env-file .env` by
    default, and `--env-file .worktree.env` when configured.
  - `envCommands` comes back empty for a worktree-only spec and for `--docs`
    (stays silent).
- [ ] In `planUp`, build `envCommands` (guarded
      `envFileCommandFor(envFile, projectName, offset)`) and `dockerCommands`
      (guarded compose `up` with `composeFileArg` and `--env-file`). Remove the
      compose push from `commands` and return both lists. Both stay empty when
      `gate.blocked`.
- [ ] Add `envFileCommandFor`, which builds one POSIX-sh command:
  - If the target is a symlink, it prints why (`docker.envFile` must name a file
    of its own, not a seeded one) and exits 1.
  - Otherwise it `touch`es the file and appends each key only when
    `grep -q '^KEY='` misses.
  - It single-quotes the path.
- [ ] Add tests for that command: run it under `sh` in a temp dir.
  - A fresh file gets both keys.
  - A re-run is byte-identical (idempotent).
  - An existing file with other keys keeps them.
  - A symlink exits 1 and leaves the link's target untouched.
- [ ] In `cli.js` (the `up` printer), print `then, in the worktree, run:` as
      `[...seedCommands, ...envCommands, ...setupCommands, ...dockerCommands]`
      and drop the `write <envFile> in the worktree:` prose block. Update
      `cli-spec-env-up*.test.js` to match.
- [ ] In `teardown.js`, add a comment saying why `down` keeps running from the
      primary checkout without `--env-file` (Decision 4).
- [ ] Update `assets/core/env.config.md`: give the order, the `envFile` comment
      ("written into the worktree, and passed to compose as `--env-file`"), and
      the symlink refusal. Check every skill asset that mentions "write the env
      file" or the old order (`grep -rn "envContents\|in the worktree" packages/common/assets`).
- [ ] Commit with `Release-Note:` saying Docker-escalated specs now bring their
      stack up isolated, after setup, from the worktree, and that
      `docker.envFile` can name any file.
- [ ] Run `pnpm test`, plus
      `docker run --rm --init -v "$PWD":/app -w /app node:22 node --test`, until
      green.
- [ ] Release both distributions (`RELEASING.md`): base first, then linear, as
      minor bumps.

## Notes

- Consumer waiting on it: skitterload sets `docker.envFile` to `.worktree.env`
  so its secrets hook allows the write. Until this ships, skitterload's
  `/spec-start` on a Docker spec has to run compose by hand with `--env-file`.
