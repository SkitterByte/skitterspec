# Phase 1 — Pure `planPrune` planner + tests ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** A deterministic, side-effect-free `planPrune` that decides which
namespace volumes are orphans and emits their `docker volume rm` commands —
proven by unit tests, no live docker/git.

## Tasks

- [x] Add `packages/common/src/env/prune.js` exporting
      `planPrune(volumes, liveSlugs, opts)`.
- [x] Compute `repoSlug`-based namespace and the protected-prefix set from
      `liveSlugs` (`${repoSlug}_${slug}_`); an orphan is any namespace volume not
      matching a protected prefix. `repoSlug` comes from `opts` (caller
      supplies it — planner stays pure; no `repoInfo` IO here).
- [x] Support optional `opts.olderThanDays` filtering against a caller-supplied
      `createdAt` per volume. Volumes are `string | {name, createdAt}`; strings
      = unknown age and are conservatively **kept** when age-gating. `now`
      (epoch-ms) supplied by caller; required when `olderThanDays` is set.
- [x] Return `{ orphans, commands }` where `commands = orphans.map(v => `docker
      volume rm ${v.name}`)`. Empty orphans → empty commands (clean no-op).
- [x] Add `packages/common/test/env-prune.test.js` covering: exact-prefix safety
      (`add` does not protect `add-widget`), a live slug protected, a true orphan
      reaped, volumes outside the namespace ignored, empty inputs, the
      `olderThanDays` cutoff (+ unknown-age kept), and the two throw guards.
      (`planPrune` only sees `liveSlugs` — the worktree-vs-registry liveness
      policy is the CLI's job, tested in Phase 2.)
- [x] Run `node --test` from `packages/common` (and repo root) — green before the
      phase is done. No typecheck script exists; the suite is the gate.
      **Result: 10/10 prune tests pass; full suite 407/407.**

## Notes

Mirror the pure-planner style of `env/teardown.js` (`planDown`): no `Date.now()`
— the caller passes any timestamps/`createdAt`. Slugs are kebab-case
(`[a-z0-9-]`) and `_` is the compose project/volume separator, which is why the
trailing `_` on protected prefixes yields an exact slug match.
