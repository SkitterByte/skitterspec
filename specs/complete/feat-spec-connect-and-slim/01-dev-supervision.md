# Phase 1 — Host dev-process supervision ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `skitterspec spec-env dev up|down <spec>` starts/stops a spec's host
dev servers (e.g. `pnpm dev`) on its slot's ports, detached, with per-process
logs, PID tracking, and a health gate — proven by unit tests over pure planning
plus a live start/stop against a trivial fixture server.

## Tasks

- [x] Extend `env.config.js` to load and validate a `dev` array —
      `{ name, command, portVar, health, frontPort }` per entry; default `[]`
      (feature unused); merge over frozen defaults like the other blocks.
- [x] Add `src/env/dev.js` — **pure** `planDev(spec, slot, config)` returning,
      per process: the expanded command, the resolved port (`portBase +
      slot*portsPerSpec + index` via `portVar`), the log path
      (`.spec-env/logs/<folder>-<name>.log`), and the expanded `health` URL.
      No side effects (mirrors `provision.js`/`teardown.js`).
- [x] Wire `spec-env dev up <spec>` in `cli.js`: for each planned process,
      spawn **detached**, redirect stdout/stderr to its log, write the PID to
      `.spec-env/pids/<folder>-<name>.pid`, then poll `health` until ready (bounded
      timeout → clear failure, leave already-started peers running with a report).
- [x] Wire `spec-env dev down <spec>`: read the PID files, terminate each
      process (SIGTERM → SIGKILL fallback), remove the PID files. Idempotent —
      a spec with no PIDs is a clean no-op.
- [x] ~~Gitignore `/.spec-env/logs/` and `/.spec-env/pids/`~~ — already covered:
      `/.spec-env/` is gitignored wholesale (plus `*.log`). Dirs created on demand.
- [x] Add `dev` to the `assets/core/env.config.json.example` + document the block
      (fields, `{portVar}` token expansion, `frontPort`) in `env.config.md`.
- [x] Unit tests: `planDev` port math + token/health expansion for a
      single-process and a UI+API array; config load/merge of `dev`. Live test:
      start/stop a fixture HTTP server via the supervise seam, assert PID files
      and health gate. **137 tests green** (`node --test`; no separate typecheck —
      plain JS). Also verified full CLI e2e (`dev up`→health→`dev down`).

## Notes

The engine only plans + does process IO here; the **skills** don't change in
this phase (they're rewired in Phase 3). Keep `planDev` free of git/docker so it
stays unit-testable, matching decision #2 of the original isolation spec.

**Deviations from the plan (all recorded in the overview changelog):**
- Split the process IO into a dedicated `src/env/supervise.js` seam
  (`startProcess`/`stopProcess`/`waitHealthy`), so start/stop/health are
  unit-testable against a fixture without going through `cli.js`. `planDev`
  stays pure; `cli.js` is thin glue.
- Log/pid files are keyed by the spec **folder** (`feat-demo`), not the bare
  slug, matching how the registry keys slots (avoids a `feat-foo`/`bug-foo`
  collision).
- `dev up` **allocates a registry slot even for a worktree-only spec** — host
  dev servers need a reserved port block regardless of Docker (previously slots
  were Docker-only). Idempotent; `dev down` never touches the registry.
- `stopProcess` signals the **process group** (`-pid`), not just the leader, so
  a detached `pnpm dev`'s children (vite/tsc) are reaped too.
</content>
