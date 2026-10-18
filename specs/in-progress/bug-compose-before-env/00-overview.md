---
linear_identifier: "SKS-387"
linear_url: "https://linear.app/skitterbyte/issue/SKS-387/bug-spec-env-up-starts-the-docker-stack-before-its-env-file-exists"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: `spec-env up` starts the Docker stack before its env file exists

> **Type:** Bug
> **Name:** bug-compose-before-env (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-10-18)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-17
> **Area:** packages/common/src/env/provision.js, packages/common/src/cli.js, packages/common/src/env/teardown.js, packages/common/assets/core/env.config.md
> **Stack:** worktree

## Symptom

In skitterload (skitterspec-linear 17.3.2), `/spec-start` on a
`Stack: worktree + docker` spec failed with:

```
Container skitterload-test-db  Error response from daemon: Conflict. The container
name "/skitterload-test-db" is already in use by container "dd632f78…"
```

`spec-env up` prints its plan in this order:

1. `git worktree add …`, under **to provision, run:**
2. `docker compose -f docker-compose.yml --project-name <p> up -d`, under the same heading
3. seed commands, under **then, in the worktree, run:**
4. `setup` commands (skitterload's derives `DEV_DB_CONTAINER` / `DEV_DB_PORT` /
   `TEST_DB_*` into the env file)
5. **write `<envFile>` in the worktree:**, which is prose rather than a command

Compose runs at step 2, before the env file exists (step 5) and before `setup`
has derived anything into it (step 4). It also runs from the **primary
checkout**, since it is listed with the primary-checkout commands, so it reads
the primary checkout's `.env`. A compose file that interpolates per-spec values
falls back to its defaults and collides with the main stack. The stack can't
come up isolated, whether or not the steps are run as printed.

A second, independent problem came from the same run: the env file is written
by the agent from prose, never by a command. Where the project's `envFile` is
`.env`, a secrets guard (skitterload's `protect-secrets` hook blocks any tool
call naming `.env`) refuses the write. There is also no way to point compose
at a different file name, because `docker.envFile` never reaches
`docker compose`.

## Root cause

`planUp` (`provision.js`) pushes the compose `up` into `commands`, the list
run from the primary checkout before any worktree step. It never passes
`--env-file`. `docker.envFile` is only used as a label in the CLI's prose block
(`cli.js`, `write ${config.docker.envFile} in the worktree:`).

## Decisions

1. **Compose becomes the last worktree step:** seeds, then the env file, then
   setup, then compose. Setup may derive values into the env file, so compose
   must follow it. Running in the worktree with the `worktreeCd` guard puts
   compose's project directory in the right tree.
2. **The env file becomes a command, not prose.** It is idempotent: it appends
   `COMPOSE_PROJECT_NAME` / `PORT_OFFSET` only where missing. It refuses loudly
   when the target is a **symlink**: a seeded env file pointing at the primary
   checkout's would otherwise get the spec's port block written into the main
   checkout's file. It runs **after** the seeds so that collision is caught
   rather than hidden.
3. **Always pass `--env-file <docker.envFile>`** to `up`. With the default
   `.env` this is identical to compose's own discovery, so nothing changes for
   existing projects. With any other name, the key works for the first time.
4. **Teardown `down` stays as it is**, run from the primary checkout with
   `--project-name`. Compose finds the containers by project label, and the
   worktree's env file may already be gone. Record that in a comment.
5. **`--json` gains `envCommands` and `dockerCommands`, and keeps
   `envContents`.** The change is additive. `commands` no longer contains the
   compose line, which is the bug fix itself; say so in the release note.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env up` plan order and headings; the `write <envFile>` prose block is replaced by a command |
| Domain object | update | `planUp` result (+`envCommands`, +`dockerCommands`; compose removed from `commands`) |
| Config key | update | `docker.envFile` now reaches `docker compose --env-file` |
| Skill/rule | update | `env.config.md` documents the order, the symlink refusal and `--env-file` |

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Reorder the plan, emit the env file as a command, pass `--env-file` | ✅ | [01-reorder-and-env-file.md](01-reorder-and-env-file.md) |

## Open questions

- None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-17 | Ready | backlog | Reuben Greaves |
| 2026-10-18 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-10-17 — Spec created from skitterload's failed `/spec-start` of
  `feat-regime-intake`. Written as a Ready backlog bug, to be picked up later,
  rather than through `/spec-bug`'s test-first flow, because the session that
  found it couldn't edit this repo (`/add-dir` is unavailable over Remote
  Control). Phase 1 starts by writing the failing test.
- 2026-10-18 — Phase 1 built. Decision 5's `--json` half has no surface:
  `spec-env up` has no `--json`, so `envCommands` / `dockerCommands` are on
  the `planUp` result only. The CLI test lives in
  `cli-spec-env-up-docs.test.js`, which already scaffolds a docker spec.
  Consequence worth a release-note line: a docker project that seeds its
  `envFile` as a symlink (the shipped example seeds `.env` and defaults
  `envFile` to `.env`) now gets a refusal at the env-file step where it
  used to write the primary checkout's file. Documented in `env.config.md`.
  Release left unticked: it is the operator's call (`RELEASING.md`).
