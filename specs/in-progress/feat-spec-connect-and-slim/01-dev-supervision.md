# Phase 1 — Host dev-process supervision ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec spec-env dev up|down <spec>` starts/stops a spec's host
dev servers (e.g. `pnpm dev`) on its slot's ports, detached, with per-process
logs, PID tracking, and a health gate — proven by unit tests over pure planning
plus a live start/stop against a trivial fixture server.

## Tasks

- [ ] Extend `env.config.js` to load and validate a `dev` array —
      `{ name, command, portVar, health, frontPort }` per entry; default `[]`
      (feature unused); merge over frozen defaults like the other blocks.
- [ ] Add `src/env/dev.js` — **pure** `planDev(spec, slot, config)` returning,
      per process: the expanded command, the resolved port (`portBase +
      slot*portsPerSpec + index` via `portVar`), the log path
      (`.spec-env/logs/<slug>-<name>.log`), and the expanded `health` URL.
      No side effects (mirrors `provision.js`/`teardown.js`).
- [ ] Wire `spec-env dev up <spec>` in `cli.js`: for each planned process,
      spawn **detached**, redirect stdout/stderr to its log, write the PID to
      `.spec-env/pids/<slug>-<name>.pid`, then poll `health` until ready (bounded
      timeout → clear failure, leave already-started peers running with a report).
- [ ] Wire `spec-env dev down <spec>`: read the PID files, terminate each
      process (SIGTERM → SIGKILL fallback), remove the PID files. Idempotent —
      a spec with no PIDs is a clean no-op.
- [ ] Gitignore `/.spec-env/logs/` and `/.spec-env/pids/` (registry already
      ignored); ensure the dirs are created on demand.
- [ ] Add `dev` to the `assets/core/env.config.json.example` + document the block
      (fields, `{portVar}` token expansion, `frontPort`) in `env.config.md`.
- [ ] Unit tests: `planDev` port math + token/health expansion for a
      single-process and a UI+API array; config load/merge of `dev`. Live test:
      start/stop a fixture HTTP server via `dev up`/`dev down`, assert PID files
      and health gate. Run the project's typecheck + test commands
      (see `.claude/rules/spec-planning.md`) — green before done.

## Notes

The engine only plans + does process IO here; the **skills** don't change in
this phase (they're rewired in Phase 3). Keep `planDev` free of git/docker so it
stays unit-testable, matching decision #2 of the original isolation spec.
</content>
