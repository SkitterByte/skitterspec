# Phase 1 — Per-spec `Stack` field + planner sources Docker from it ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `resolveSpec` reads a spec's `> **Stack:**` header into `spec.stack`,
and `planUp` decides whether to bring up Docker from that per-spec value (gated by
the project master switch) instead of the global `config.docker.enabled` alone —
proven by unit tests over both header states and the legacy-missing case.

## Tasks

- [x] Add a `readStackField(specPath, config)` helper in `resolve.js` that parses
      a `> **Stack:**` blockquote line from `00-overview.md`; map `worktree` →
      `'worktree'`, any value containing `docker` → `'docker'`. Missing field →
      project default (`config.docker.enabled ? 'docker' : 'worktree'` — a legacy
      spec keeps prior behaviour; see Notes).
- [x] Populate `spec.stack` in `resolveSpec`'s return object (alongside `type`,
      `slug`, `branch`).
- [x] In `planUp`, derive `wantsDocker = stack === 'docker' &&
      config.docker.enabled` and gate the `docker compose` command on it (replaces
      the bare `config.docker.enabled` check). Leave slot/`.env` behaviour to
      Phase 2 — this task only moves the Docker-command gate.
- [x] Add/extend tests in the env test file(s): `resolveSpec` returns
      `stack: 'worktree'` and `'docker'` for the two header forms and the default
      for a spec with no field; `planUp` includes the `docker compose` command
      only when `stack: 'docker'` and the master switch is on. Ran `npm test` —
      118/118 green (no typecheck script; plain CommonJS).

## Notes

- **Master switch semantics** are finalised in Phase 3 (Decision 5). In this
  phase treat `config.docker.enabled` as the existing global flag; the per-spec
  `Stack` field ANDs with it. Legacy specs (no field) on a project with
  `docker.enabled: true` therefore still get Docker — no silent behaviour change
  until the operator adds the field or Phase 3's docs steer them.
- Keep `Stack` a **blockquote** field (`> **Stack:** …`) for greppability and
  parity with `> **Type:**` — not YAML frontmatter (which `resolveSpec` reserves
  for `linear_identifier`).
