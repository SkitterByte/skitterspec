# Phase 2 — Provision: `spec-env up` + `/spec-env` skill ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `skitterspec spec-env up <spec>` allocates a slot, persists the
registry, and **prints** the exact `git worktree` / `docker compose up` commands,
the `.env` contents, the expanded `open.command` (when set), and a summary —
idempotent. A thin `/spec-env` skill executes the printed side effects (incl.
writing the `.env` into the freshly-created worktree). Pure generators are
unit-tested; the skill drives git/docker/open.

## Tasks

- [x] Add `src/env/provision.js`: `planUp(spec, { slot, attached }, config)`
      — pure planner returning `{ worktreePath, branch, projectName, slot,
      portOffset, envContents, openCommand, commands, attached }`. `commands` are
      the exact strings the skill runs: `git worktree add {worktreePath} -b
      {branch}` (attach form `git worktree add {worktreePath} {branch}` when the
      slot already existed), and `docker compose --project-name {projectName} up
      -d` (only when `docker.enabled`). `openCommand` is the expanded
      `open.command` (`{worktreePath}`/`{slug}`/`{branch}`/`{projectName}`/
      `{portOffset}`) or `null` when empty. No side effects beyond returning the
      plan — the caller allocates the slot and passes the resulting registry.
- [x] Add `src/env/render.js`: `renderEnvFile({ projectName, portOffset })` →
      `.env` body with `COMPOSE_PROJECT_NAME={projectName}` and
      `PORT_OFFSET={portOffset}`; `expandOpenCommand(template, tokens)` → the
      opener string with tokens expanded (empty/whitespace template → `null`).
- [x] Wire `spec-env up` into `src/cli.js`: read the registry, allocate the slot
      (idempotent — existing slot reused), persist the registry (**the engine's
      only write** — the worktree doesn't exist yet, so the engine renders the
      `.env` contents but does not write them), then **print** the plan: worktree
      path, branch, project name, allocated port block, the git/docker commands,
      the `.env` contents block, and the `open.command` (when set). No-op with a
      clear message when config absent.
- [x] Write `assets/skills/spec-env/SKILL.md` (house format — frontmatter `name`
      + `description` with trigger phrases, then numbered prose steps): resolve the
      spec (arg or in-context); run `skitterspec spec-env up <spec>`; execute the
      printed `git worktree add` (sibling dir, **never nested**; attach if it
      exists rather than clobber); write the printed `.env` contents into the new
      worktree; if `docker.enabled` run the printed `docker compose up`; if an
      `open.command` was printed, run it; echo the summary. Idempotent —
      re-running attaches, never reallocates.
- [x] Symlink the skill into `.claude/skills/spec-env` → `../../assets/skills/spec-env`.
- [x] Add tests (`node --test`): `test/env-provision.test.js` (plan for a fresh
      spec vs an already-provisioned one → attach form; port offset per slot;
      `openCommand` expansion vs null when empty; docker command omitted when
      `docker.enabled:false`), `test/env-render.test.js` (`.env` contents;
      `expandOpenCommand` tokens + empty → null). Pure functions only — no live
      git/docker.
- [x] Run `npm test` — all green before the phase is done.

## Notes

The Warp-specific Tab Config layer was **dropped** (see overview Decision #1 +
2026-07-08 changelog) — no `.toml`/deeplink generation, no Open question. Volume
isolation is free: `COMPOSE_PROJECT_NAME` prefixes named volumes, so no
per-volume renaming is needed. The worktree is a **sibling** of the primary
checkout (`worktree.root` default `../{repo}-wt`), never nested inside it.
