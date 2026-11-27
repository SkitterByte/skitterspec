---
github_identifier: "#342"
github_url: "https://github.com/SkitterByte/skitterspec/issues/342"
---

# Drop per-spec Docker stacks

> **Type:** Feature
> **Name:** feat-drop-docker-stacks (the spec folder name — the handle you paste into `/spec-start`)
> **Author:** Reuben Greaves
> **Raised:** 2026-11-27
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/342
> **Area:** packages/common/src/env/{provision,teardown,prune,resolve,registry,render,hotfix,live,config,dev}.js, packages/common/src/cli.js, packages/common/src/init.js, packages/common/assets/{skills,core,rules}, packages/*/README.md, packages/*/MIGRATION.md, docs/{index,reference}.html
> **Stack:** worktree
> **Epic:** epic-live-workbench
> **Waits on:** none
> **Docs:** index, reference

## Summary

skitterspec stops creating, starting and tearing down a Docker stack per spec.
Every spec gets a plain worktree. Old configs and specs that mention Docker
keep working, with a deprecation notice.

## Problem

The per-spec Docker stack (`docker` config, `Stack: worktree + docker`, compose
up and down, `.env` rendering, volume backup at teardown) never worked well,
and it is the most complicated part of isolation. It also blocks a simpler
story for stateful testing, which is a live take with a database snapshot
(`feat-live-db-snapshot`).

## Acceptance criteria

- `spec-env up` never prints or runs a `docker` command, whatever the config
  or `Stack:` header says.
- `spec-env down`, `prune` and hotfix finish never mention volumes, a backup
  command or a Docker stack.
- A config with a `docker` key loads, prints a one-line deprecation notice,
  and is otherwise ignored.
- A spec headed `> **Stack:** worktree + docker` provisions as a plain worktree
  and says so once.
- Host dev servers (`spec-env dev up`) still get their own port block.
- New specs have no `Stack:` line, and the spec-authoring grill no longer asks
  about it.

## Decisions

1. **Tolerate and warn, never error.** The `docker` key and `Stack:` header are
   read and ignored, each with a notice, through the existing unknown-key and
   deprecation paths. A hard error would break every project that ever set them,
   for a key that now does nothing.
2. **Port blocks move to `ports: { base, perSpec }`.** `spec-env dev` needs
   them, and they lived under `docker`. `docker.portBase` and
   `docker.portsPerSpec` are read as a fallback, with a notice, when `ports` is
   unset. The defaults stay at 3000 and 10, so no existing dev server moves.
3. **Registry slots stay, and now only mean "this spec has a dev port block".**
   This removes the reading of a slot as "runs a Docker stack" (`registry.js`,
   `hotfix.js`).
4. **The live refusal for `Stack: docker` goes.** `Stack:` no longer means
   anything. The migrations refusal is the stateful guard that remains.
5. **Major bump for `skitterspec`.** The `docker` config key stops having any
   effect, which `MIGRATION.md` records.

## Solution overview

Phase 1 removes the Docker branches from the engine: `resolveStack` always
answers worktree, and the planners lose their compose, `.env`, volume and
backup steps. Config loading moves the port keys and adds the notices. Phase 2
removes Docker from every asset and doc, and from the spec template and grill.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | remove | `docker.*` (ignored, with notice) |
| Config key | add | `ports.base`, `ports.perSpec` |
| Spec header | remove | `> **Stack:**` (read as worktree) |
| CLI command | update | `spec-env up/down/prune`, hotfix finish: no docker steps |
| CLI command | update | `spec-env live take`: no `Stack: docker` refusal |
| Skill/rule | update | `/spec` grill item 9, spec template, isolation.md, spec-start/complete/cancel, no-spec, spec-init |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done · ➖ cancelled.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Engine stops provisioning Docker; config tolerates the old keys | ✅ | [01-engine.md](01-engine.md) |
| 2 | Assets and docs no longer mention Docker stacks | ✅ | [02-assets-docs.md](02-assets-docs.md) |

## Open questions

- None

## Changelog

- 2026-11-27 — Spec created as member 1 of epic-live-workbench.
- 2026-11-27 — Phase 1: kept the hotfix finish slot guard, reworded as a dev
  port block, since only `down` frees a slot. Decision 1's notice lives in
  `config.js`, not `deprecate.js`. `spec-env prune` is kept as the pidfile
  reap. The example config and `docs/review.html`'s covers moved in phase 1,
  because the tests need them.
- 2026-11-27 — Phase 2: fixed `spec-env resolve` printing `project:
  undefined`, a phase 1 miss. Removed the volume-prune sub-step from
  `/spec-complete` and `/spec-cancel`. Synced the parked providers'
  `MIGRATION.md` by hand.
