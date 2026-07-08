# Phase 2 — Provision: `spec-env up` + `/spec-env` skill ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec spec-env up <spec>` allocates a slot, writes the
worktree's `.env`, generates a Warp Tab Config `.toml` + `warp://` deeplink, and
**prints** the exact `git worktree` / `docker compose up` commands + a summary —
idempotent. A thin `/spec-env` skill executes the printed side effects. Pure
generators are unit-tested; the skill drives git/docker/warp.

## Tasks

- [ ] Add `src/env/provision.js`: `planUp(spec, config, { timestamp })` — pure
      planner returning `{ worktreePath, branch, projectName, slot, portOffset,
      envContents, warpTomlPath, warpTomlContents, warpDeeplink, commands }`.
      `commands` are the exact strings the skill runs: `git worktree add
      {worktreePath} -b {branch}` (attach form when the worktree/branch already
      exists), and `docker compose --project-name {projectName} up -d` (only when
      `docker.enabled`). No side effects beyond returning the plan.
- [ ] Add `src/env/render.js`: `renderEnvFile(...)` → `.env` body with
      `COMPOSE_PROJECT_NAME={projectName}` and `PORT_OFFSET={portOffset}`;
      `renderWarpTabConfig(...)` → a **current-format** Warp Tab Config `.toml`
      that `cd`s into the worktree, runs the stack, and (if `warp.openAgentPane`)
      opens a Claude Code / agent pane; `warpDeeplink(name)` →
      `warp://tab_config/<name>`. Expand `~` in `warp.tabConfigDir`.
- [ ] Wire `spec-env up` into `src/cli.js`: allocate the slot (idempotent —
      existing slot reused), write the worktree `.env` and the Warp `.toml` to
      disk (the only filesystem writes the engine makes), then **print** the plan:
      worktree path, branch, project name, allocated port block, Warp deeplink,
      and the git/docker commands to run. No-op with a clear message when config
      absent.
- [ ] Write `assets/skills/spec-env/SKILL.md` (house format — frontmatter `name`
      + `description` with trigger phrases, then numbered prose steps): resolve the
      spec (arg or in-context); run `skitterspec spec-env up <spec>`; execute the
      printed `git worktree add` (sibling dir, **never nested**; attach if it
      exists rather than clobber); if `docker.enabled` run the printed
      `docker compose up`; if `warp.enabled` print the `warp://` deeplink; echo
      the summary. Idempotent — re-running attaches, never reallocates.
- [ ] Symlink the skill into `.claude/skills/spec-env` → `../../assets/skills/spec-env`.
- [ ] Add tests (`node --test`): `test/env-provision.test.js` (plan for a fresh
      spec vs an already-provisioned one → attach form; port offset per slot),
      `test/env-render.test.js` (`.env` contents; Warp `.toml` shape incl. agent
      pane toggle; `~` expansion; deeplink string). Pure functions only — no live
      git/docker.
- [ ] Run `npm test` — all green before the phase is done.

## Notes

Resolve the **Open question** first: confirm the current Warp Tab Config `.toml`
schema against a live Warp install before freezing `renderWarpTabConfig` — do
**not** emit the legacy YAML launch-config format. Volume isolation is free:
`COMPOSE_PROJECT_NAME` prefixes named volumes, so no per-volume renaming is
needed. The worktree is a **sibling** of the primary checkout (`worktree.root`
default `../{repo}-wt`), never nested inside it.
