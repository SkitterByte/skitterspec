# Slim the spec command surface + local traffic diversion (`spec-connect`)

> **Type:** Feature
> **Status:** In Progress — Phase 1 done, Phase 2 next
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-07-22
> **Area:** `packages/common/src/env/` (new `proxy.js`, `dev.js`, `supervise.js`;
> touches `cli.js`, `config.js`), `packages/common/src/init.js`,
> `packages/common/assets/skills/` (delete `spec-env`, `spec-env-down`,
> `spec-ready`; add `spec-connect`; rewrite `spec-go`, `spec-complete`,
> `spec-cancel`, `spec`), `packages/common/assets/core/env.config.*`,
> `MIGRATION.md`, `README.md`, `assets/rules/spec-planning.md`, package
> `package.json`s (3.0.0), `packages/common/test/`. (Canonical source is
> `packages/common/`; `skitterspec` + `skitterspec-linear` are gitignored built
> distributions composed by `scripts/build-dist.js`.)
> **Stack:** worktree

## Problem

Two pains, one root. **(1) Too many commands.** The spec workflow exposes 13
`spec-*` skills; even the author can't hold the everyday loop
(up → test → commit → clean up) in their head. Lifecycle side-effects (provision
a worktree, start services, tear down) live in *separate* commands
(`spec-env`, `spec-env-down`) instead of the transition that already implies
them (`spec-go`, `spec-complete`). **(2) Can't test UI/API worktrees.** On
UI/API projects the app runs from `main`'s process on the canonical origin
(`localhost:3000`/`:8080`), so a worktree's changes are unreachable — the
reserved port block exists but nothing routes the browser (or the UI→API base
URL, OAuth callbacks, cookies) to it. There's no one command to say "point my
local at this feature."

## Decisions

1. **Everyday surface collapses to five verbs:** `spec → go → connect → commit →
   complete`. Everything else becomes an escape hatch or is deleted. This is the
   mental model the docs lead with.
2. **`spec-go` becomes the single "up" button.** Promote to in-progress **+**
   create the worktree **+** start the host dev servers on the slot's ports **+**
   register the proxy route — in one command. **Confirm before heavy steps:**
   print the plan (ports, containers, dev commands) and wait for a yes; a
   `--plan` flag previews without running. Rejected auto-with-no-prompt (too
   aggressive on shared machines; user chose confirm-first).
3. **`spec-complete` / `spec-cancel` fold in teardown.** Kill the dev PIDs,
   `docker compose down`, remove the worktree, free the slot, `caddy reload`
   (or `stop` when the registry empties). No separate `spec-env-down`.
4. **New `spec-connect <spec>` — the traffic-diversion command.** Points the
   canonical origin at a spec by setting an `x-spec-env` cookie; `spec-connect
   main` clears it (revert to the primary checkout). Named `spec-connect`
   ("connect my local to this spec") over `spec-serve`/`spec-host` because the
   proxy is not started *by* this command in spirit — it just switches the
   target (though it will lazily start Caddy if down).
5. **Caddy is the front-door proxy, lazily managed.** `spec-connect`/`spec-go`
   probe Caddy's admin API (`:2019`); down → generate the Caddyfile from the
   registry and `caddy start` (daemonizes itself); up → `caddy reload`
   (zero-downtime hot swap); registry empties on teardown → `caddy stop`. We do
   **not** supervise Caddy ourselves. Rejected a shipped Node proxy (user chose
   Caddy — battle-tested, native cookie routing + admin-API reload).
6. **Cookie-based routing on the unchanged origin.** Caddy routes by
   `{http.request.cookie.x-spec-env}` → that slot's port block via a `map`;
   no cookie → the primary checkout's ports. Cookies are **not port-scoped**
   (RFC 6265), so one `x-spec-env` cookie on `localhost` governs both `:3000`
   (UI) and `:8080` (API) → the UI/API halves stay glued with **no base-URL
   rewriting**. The cookie is **stripped before forwarding upstream** so the app
   never sees it. The cookie is set by a Caddy-served route
   `GET /__spec/connect/<slug>` (Set-Cookie + 302 to `/`); `spec-connect` just
   opens that URL. Rejected a bookmarklet/extension (needs no browser install).
7. **Host dev processes are a config-driven array.** `env.config.json` gains
   `dev: [{ name, command, portVar, health, frontPort }]`. `spec-go` launches
   each **detached**, tees to `.spec-env/logs/<slug>-<name>.log`, records each
   PID under `.spec-env/`, and waits on `health` before reporting ready.
   `frontPort` tells the Caddyfile which canonical origin that process fronts
   (e.g. `api` → 8080, `ui` → 3000). A single-process app is a one-element
   array. Rejected a single opaque `pnpm dev` command (can't health-check or
   stop UI/API independently).
8. **Delete three *skills*, keep the engine.** Remove the user-facing
   `spec-env`, `spec-env-down`, `spec-ready` skills (breaking). The
   `skitterspec spec-env up|down|integrate|status|resolve` **CLI engine stays** —
   `spec-go`/`spec-complete`/`spec-cancel` call it internally. `spec-ready`'s
   blessing folds into `/spec` (a fully-groomed spec is written **Ready**);
   a deferred draft is blessed by `spec-go` (which now confirms anyway) or
   `spec-review`. Rejected demote-but-keep (user chose delete for the smallest
   surface) and delete-the-engine-too (would re-implement tested port math in
   skill prose).
9. **Breaking release.** Removing shipped skills bumps `2.0.1 → 3.0.0` with a
   `MIGRATION.md` entry mapping each removed command to its replacement.

## Solution overview

**Config — `env.config.json` gains two blocks:**

```jsonc
{
  // ...existing worktree/docker/registry/branch/guards...
  "dev": [
    { "name": "api", "command": "pnpm --filter api dev",
      "portVar": "API_PORT", "frontPort": 8080,
      "health": "http://localhost:{API_PORT}/health" },
    { "name": "ui",  "command": "pnpm --filter ui dev",
      "portVar": "PORT",     "frontPort": 3000,
      "health": "http://localhost:{PORT}/" }
  ],
  "proxy": {
    "enabled": true,
    "cookie": "x-spec-env",
    "caddyfile": ".spec-env/Caddyfile",   // generated, gitignored
    "adminApi": "http://localhost:2019"
  }
}
```

**Front door.** One Caddy instance owns the `frontPort`s. Per canonical origin a
`map` sends the `x-spec-env` cookie value → that slot's process port; unmatched →
primary. The `.spec-env/Caddyfile` is regenerated from `.spec-env/registry.json`
on every `up`/`down`/`connect` and hot-reloaded. Caddy is started lazily and
stopped when no specs remain.

**Everyday loop:** `spec → go → connect → commit → complete`. `spec-go` shows a
plan and, on yes, brings up worktree + dev servers + route. `spec-connect feat-x`
diverts the browser; `spec-connect main` reverts. `spec-complete` tears it all
down and lands the branch (existing `integrate`).

**Known limits (accepted):** one active target per browser profile (the cookie
is per-profile — two specs at once needs two profiles); inbound webhooks carry
no cookie, so external callbacks hit the primary checkout (per-spec webhook
paths deferred).

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Host dev-process supervision (`dev` config + start/stop/health) | ✅ | [01-dev-supervision.md](01-dev-supervision.md) |
| 2 | Caddy front door + `spec-connect` (cookie routing, lazy lifecycle) | ⬜ | [02-caddy-connect.md](02-caddy-connect.md) |
| 3 | Slim the surface (fold into go/complete/cancel, delete 3 skills, migrate) | ⬜ | [03-surface-slim.md](03-surface-slim.md) |

## Open questions

- [ ] Caddy local HTTPS: plain `http` on the canonical ports is assumed enough
      for dev. Revisit only if a project needs `https://localhost` (Caddy can
      issue from its internal CA, but adds a trust step).
- [ ] Per-spec inbound-webhook routing (a path or header override) — deferred;
      the cookie limit is documented, not solved, in v3.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-07-22 | Draft | backlog | Reuben Greaves |
| 2026-07-22 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-07-22 — **Phase 1 done** (host dev-process supervision). Added the `dev`
  config block (`config.js`, normalised + lenient), the pure `planDev` planner
  (`src/env/dev.js`), and a process-IO seam `src/env/supervise.js`
  (`startProcess`/`stopProcess`/`waitHealthy`); wired `spec-env dev up|down` in
  `cli.js` (made `specEnv`/`run` await the async path); documented the block in
  `env.config.{json.example,md}`. 14 new tests (137 total, green via `node
  --test`) + a full CLI e2e (real fixture server: `dev up`→health ok→`dev
  down`→unreachable). Deviations: source lives in **`packages/common/`** (the
  built `skitterspec`/`skitterspec-linear` are gitignored) — Area header
  corrected; split the IO into `supervise.js`; log/pid files keyed by spec
  **folder**; `dev up` allocates a slot even for a **worktree-only** spec (host
  servers need a port block regardless of Docker); `stopProcess` signals the
  **process group** so `pnpm dev`'s children are reaped; `.spec-env/` was
  already gitignored so no gitignore change. See Phase 1 notes.
- 2026-07-22 — Spec created. Decisions set via chat grill across the session:
  5-verb surface; `spec-go` as confirm-then-up; teardown folded into
  complete/cancel; new `spec-connect` cookie-switch; Caddy lazy-managed proxy
  with a registry-generated Caddyfile; `dev` array for host-process supervision;
  delete the `spec-env`/`spec-env-down`/`spec-ready` skills (keep the CLI
  engine); breaking `3.0.0` + MIGRATION.md.
</content>
</invoke>
