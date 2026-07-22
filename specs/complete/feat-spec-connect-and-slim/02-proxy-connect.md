# Phase 2 — Front-door proxy + `spec-connect` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a lazily-managed, **bundled Node** reverse proxy exposes **one**
connected spec's warm dev servers on the canonical origin, and `spec-env connect
<spec>|main` flips it — proven by a real in-process proxy-forwarding test + a full
CLI e2e (all local, no external binary).

**Model (exclusive, no cookie — decided 2026-07-22):** only one target is exposed
on the canonical ports at a time, so no cookie is needed — the proxy just forwards
each `frontPort` → the connected spec's corresponding port. Spec dev servers stay
warm on their offset ports (Phase 1); `connect` re-points the proxy (a
millisecond restart), no dev-server restart. `connect main` stops the proxy so the
primary checkout owns the canonical ports again. The proxy can't bind a port main
still holds, so `connect` pre-checks and tells the operator to stop main first.

**Why Node, not Caddy (reversal, 2026-07-22):** Caddy was chosen for its native
cookie routing; exclusive mode removes the cookie, so Caddy's advantage is gone
while its costs (external install — not present on the dev machine — and a second
config format) remain. A ~60-line built-in-`http` proxy ships in the package,
needs zero install, forwards WebSocket/HMR, and is fully testable locally.

## Tasks

- [x] Extend `env.config.js` to load/validate a `proxy` block (`enabled`, `host`)
      with documented defaults. (No cookie / Caddyfile / adminApi.)
- [x] Add `src/env/proxy.js`: **pure** `renderRoutes(procs)` (connected spec's
      `frontPort` procs → `[{ name, frontPort, targetPort }]`); `startProxy(routes,
      opts)` building one `http` server per route that forwards HTTP **and**
      `upgrade` (WebSocket/HMR) to `127.0.0.1:targetPort`; a `require.main` entry
      (`node proxy.js <routesFile>`) so it runs as a detached process; `portsInUse`
      + `waitListening` helpers.
- [x] Wire `spec-env connect <spec>|main` in `cli.js`: `main` → stop the proxy
      process + clear the `.spec-env/connected` + routes markers. A spec → require
      a slot (else "run spec-env dev up first"); require ≥1 `frontPort`; pre-check
      the frontPorts are free (else "stop main on :PORT first"); write the routes
      file; (re)start the detached proxy (reusing the Phase 1 supervise seam);
      wait until it's listening; record `.spec-env/connected`; print the URLs.
- [x] Add the `/spec-connect` skill (thin wrapper over `skitterspec spec-env
      connect`) to `packages/common/assets/skills/` (auto-registers via
      `listSkills()`); added it to the init "Skills resolve as …" notice.
- [x] ~~Gitignore the routes file + `connected` marker~~ — already covered by
      `/.spec-env/`.
- [x] Tests: pure `renderRoutes`; **live** `startProxy` forwarding real HTTP + a
      502-when-down case + a real `upgrade` (WebSocket handshake) passthrough;
      `portsInUse` + `waitListening`; proxy config merge. **145 tests green**
      (`node --test`). Plus a full CLI e2e (`dev up` → `connect` → `200` via the
      proxy from the right upstream → `connect main` → gone) and a
      port-conflict-refusal e2e — both verified locally, no external binary.

## Notes

Keep `renderRoutes` pure; the proxy process is supervised with the same
`startProcess`/`stopProcess` seam as Phase 1's dev servers (pid at
`.spec-env/pids/proxy.pid`). The proxy entry reads its routes from a file so a
re-`connect` just rewrites the file and restarts the (tiny) process.

**Deviations from the original plan:** no cookie, no Caddy (see the model +
"Why Node" notes above); `renderRoutes` takes the connected spec's `procs`, not
the whole registry; `up`/`down` do **not** auto-manage the proxy (exclusive mode
— connecting is always explicit); teardown-disconnect of the connected spec is
wired in Phase 3.
