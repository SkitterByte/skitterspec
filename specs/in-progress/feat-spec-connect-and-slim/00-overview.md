# Slim the spec command surface + local traffic diversion (`spec-connect`)

> **Type:** Feature
> **Status:** In Progress — Phases 1–2 done, Phase 3 next
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
   `docker compose down`, remove the worktree, free the slot, and stop the proxy
   if this was the connected spec. No separate `spec-env-down`.
4. **New `spec-connect <spec>` — the traffic-diversion command.** Exposes a
   spec's warm dev servers on the canonical origin; `spec-connect main` stops the
   proxy so the primary checkout owns those ports again. Named `spec-connect`
   ("connect my local to this spec") over `spec-serve`/`spec-host`.
5. **Front door is a bundled Node reverse proxy, lazily managed** (revised
   2026-07-22 — was Caddy). `spec-connect` (re)starts a small detached
   built-in-`http` proxy from the connected spec's routes and stops it on
   `connect main`; supervised with the Phase 1 `startProcess`/`stopProcess` seam
   (pid at `.spec-env/pids/proxy.pid`). Rejected Caddy: it was chosen for native
   **cookie** routing, but the exclusive model (Decision #6) removes the cookie —
   leaving only Caddy's costs (external install, absent on the dev machine; a
   second config format). The Node proxy needs zero install, forwards
   WebSocket/HMR, and is fully testable locally.
6. **Exclusive single-target routing (no cookie)** (revised 2026-07-22 — was
   cookie-multiplex). Only **one** spec is exposed on the canonical ports at a
   time, so no cookie/`map`/`Set-Cookie` routes are needed — the proxy just
   forwards each `frontPort` → the connected spec's matching port. Spec dev
   servers stay warm on their offset ports; `connect` re-points the proxy (a
   ~ms restart), no dev-server restart. The proxy can't bind a port the primary
   checkout still holds, so `connect` **pre-checks the frontPorts are free** and
   tells the operator to stop main first (main is started/stopped by hand).
   Rejected keeping the cookie (its only job — several targets on one origin — is
   moot when exactly one is exposed) and managing main on a shadow port (user
   chose the simpler exclusive model).
7. **Host dev processes are a config-driven array.** `env.config.json` gains
   `dev: [{ name, command, portVar, health, frontPort }]`. `spec-go` launches
   each **detached**, tees to `.spec-env/logs/<folder>-<name>.log`, records each
   PID under `.spec-env/`, and waits on `health` before reporting ready.
   `frontPort` tells the proxy which canonical origin that process fronts
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
    "host": "127.0.0.1"
  }
}
```

**Front door.** A small bundled Node reverse proxy owns the `frontPort`s and
forwards each to the **one** connected spec's matching port (routes written to
`.spec-env/proxy.json`). It's started lazily by `spec-connect` and stopped by
`spec-connect main`. Spec dev servers stay warm on their offset ports, so
`connect` is a ~ms re-point, not a dev-server restart.

**Everyday loop:** `spec → go → connect → commit → complete`. `spec-go` shows a
plan and, on yes, brings up worktree + dev servers. `spec-connect feat-x` diverts
the browser to that spec; `spec-connect main` stops the proxy so main owns the
ports again. `spec-complete` tears it all down and lands the branch (existing
`integrate`).

**Known limits (accepted):** exactly one spec exposed on the canonical ports at a
time (exclusive by design); the operator starts/stops the primary checkout's dev
server by hand (the proxy can't bind a port main still holds — `connect` says so);
inbound webhooks always hit whatever holds the canonical port (per-spec webhook
routing deferred).

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Host dev-process supervision (`dev` config + start/stop/health) | ✅ | [01-dev-supervision.md](01-dev-supervision.md) |
| 2 | Front-door proxy + `spec-connect` (bundled Node, exclusive) | ✅ | [02-proxy-connect.md](02-proxy-connect.md) |
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

- 2026-07-22 — **Phase 2 done** (front-door proxy + `spec-connect`). Added the
  `proxy` config block; `src/env/proxy.js` (pure `renderRoutes`; `startProxy`
  forwarding HTTP + WebSocket `upgrade`; `portsInUse`/`waitListening`; a
  `require.main` entry run as the detached proxy process); wired `spec-env
  connect <spec>|main` in `cli.js` (reuses the Phase 1 supervise seam, pre-checks
  port conflicts, waits for listen, records `.spec-env/connected`); added the
  `/spec-connect` skill + init notice; documented the block. 8 new tests (145
  green) incl. a real HTTP-forward + WebSocket-upgrade passthrough; plus a full
  CLI e2e (`dev up`→`connect`→200 via proxy→`connect main`→gone) and a
  port-conflict-refusal e2e. No external binary involved.
- 2026-07-22 — **Phase 2 model pivot** (before coding). Chose the **exclusive**
  front-door model (one spec exposed on the canonical ports at a time) — which
  **removes the cookie** entirely (Decision #6), and with it Caddy's reason to
  exist, so the proxy is now a **bundled Node reverse proxy**, not Caddy
  (Decision #5; Caddy also wasn't installed on the dev machine, blocking local
  E2E). Rewrote Decisions #3–#6, the config/front-door/limits sections, and
  renamed the phase file `02-caddy-connect.md` → `02-proxy-connect.md`.
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
