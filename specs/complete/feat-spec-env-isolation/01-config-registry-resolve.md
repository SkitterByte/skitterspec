# Phase 1 — Config + registry + resolve engine (the seam) ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** Ship the config schema and the pure engine core — config load, slot
registry, and spec/branch resolution — behind `spec-env status` (read-only) and
`spec-env resolve` (prints resolved fields), proven by fixture-driven unit tests
with **no live git/docker/warp**. This is the deterministic seam everything else
builds on.

## Tasks

- [x] Create `specs/.core/env.config.json.example` with the full documented
      default (schema in [00-overview.md](00-overview.md)): `worktree`, `docker`
      (incl. `backupCommand`), `warp`, `registry`, `linkLinear`, `guards`. Every
      field commented in an adjacent doc block. Do **not** commit a live
      `env.config.json` (consumer opt-in).
- [x] Add `src/env/config.js`: `loadEnvConfig(dir)` — reads
      `specs/.core/env.config.json`, merges over frozen defaults, validates types,
      returns `{ config, present }`; `present:false` when absent (opt-in gate —
      never throws on absence). Zero-dep; mirrors `assets/scripts/lib/config.js`
      shape.
- [x] Add `src/env/resolve.js`: `resolveSpec(specArg, dir, config)` — locate the
      spec folder under `specs/**`; split the `feat-`/`bug-` prefix → `{ type,
      slug, folder }`; compute `branch` via the Linear seam
      (`branchFor(spec, config)`: if `specs/.core/linear.config.json` present and
      `linkLinear`, use its `branch.pattern` + `linear_identifier` from
      `00-overview.md` frontmatter, else `{type}/{slug}`); expand
      `worktree.root`/`folderPattern`/`projectNamePattern` tokens
      (`{repo}`,`{repoSlug}`,`{slug}`). Pure; no side effects.
- [x] Add `src/env/registry.js`: `readRegistry`, `allocateSlot(name)` (lowest
      free index; idempotent — returns existing slot if already present),
      `freeSlot(name)`, and `portOffset(slot, config)` = `portBase + slot *
      portsPerSpec`. Registry path resolves against the **primary checkout root**;
      no `Date.now()`/`Math.random()` in the engine (callers pass timestamps).
- [x] Extend `src/cli.js`: add a `spec-env` command dispatch with `status`
      (list provisioned specs / slots / port blocks from the registry) and
      `resolve` (prints resolved slug/type/branch/paths for a spec). Both no-op
      with a clear message when config is absent. Add `spec-env` to `HELP`.
- [x] Add tests (`node --test`): `test/env-config.test.js` (defaults, merge,
      absent = opt-out, `present` flag), `test/env-registry.test.js` (lowest-free
      allocation across gaps, idempotent re-alloc, free, port-offset math),
      `test/env-resolve.test.js` (prefix split for feat-/bug-, `{type}/{slug}`
      fallback, Linear branch pattern when a fixture linear.config is present,
      token expansion).
- [x] Run `npm test` — all green before the phase is done.

## Notes

Engine must be deterministic and free of git/docker/warp side effects — Phase 2/3
add the provisioning/teardown *planning* (still pure) and let the skills execute.
Follow the repo's config-loader idiom (frozen defaults, merge known keys only,
forward-compatible on unknown keys).
