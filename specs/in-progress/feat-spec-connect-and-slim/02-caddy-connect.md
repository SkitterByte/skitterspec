# Phase 2 — Caddy front door + `spec-connect` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a lazily-managed Caddy instance diverts the canonical origin to any
provisioned spec by `x-spec-env` cookie, and `/spec-connect <spec>` flips it —
proven by unit tests over Caddyfile generation plus a live end-to-end
cookie-switch between two fixture stacks.

## Tasks

- [ ] Extend `env.config.js` to load/validate the `proxy` block
      (`enabled`, `cookie`, `caddyfile`, `adminApi`) with documented defaults.
- [ ] Add `src/env/proxy.js` — **pure** `renderCaddyfile(registry, config)`:
      for each `dev` process's `frontPort`, emit a site block whose `map
      {http.request.cookie.<cookie>}` sends each provisioned slug → that slug's
      resolved port, `default` → the primary checkout port; each block strips the
      cookie header before `reverse_proxy` and websocket-upgrades (HMR). Also
      emit the `handle /__spec/connect/<slug>` routes (Set-Cookie + 302 `/`) and
      `/__spec/connect/main` (clear cookie).
- [ ] Add Caddy lifecycle helpers in `cli.js` (or `proxy.js`'s IO seam):
      `caddyRunning()` (probe `adminApi`), `caddyUp()` = write generated
      Caddyfile then `caddy start` if down else `caddy reload`, `caddyDown()` =
      `caddy stop` when the registry has no provisioned specs.
- [ ] Wire `spec-env connect <spec>` in `cli.js`: ensure the spec is provisioned
      (or a clear error), `caddyUp()`, then print (and optionally `open`) the
      `http://<frontPort-host>/__spec/connect/<slug>` URL; `connect main` targets
      the clear route. Regenerate + reload on every call so new slots appear.
- [ ] Have `spec-env up`/`down` call `caddyUp()`/`caddyDown()` so routes track
      provisioning automatically (the skills consume this in Phase 3).
- [ ] Add the `/spec-connect` skill (thin wrapper: `skitterspec spec-env connect
      <spec>`, run the printed `caddy` + `open` commands) to `skitterspec`,
      `common`, and `skitterspec-linear` skill assets; register it in
      `src/init.js` `SKILLS`.
- [ ] Gitignore the generated `/.spec-env/Caddyfile`.
- [ ] Unit tests: `renderCaddyfile` for zero/one/two provisioned specs and a
      UI+API `frontPort` pair (correct map entries, default fallthrough, cookie
      strip, connect routes). Live test: two fixture stacks on two slots, assert
      the cookie set by `/__spec/connect/<slug>` routes requests to the right
      upstream and `connect main` reverts. Typecheck + tests green.

## Notes

Keep `renderCaddyfile` pure (registry + config → string) so routing is
unit-testable with no live Caddy — Caddy start/reload/stop is the IO seam,
mirroring "engine plans, skill executes". Depends on Phase 1's resolved ports
but can be built/tested against static fixture ports independently.
</content>
