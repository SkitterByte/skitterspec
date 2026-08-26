# Phase 1 — Pure `planPrune` planner + tests ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** A deterministic, side-effect-free `planPrune` that decides which
namespace volumes are orphans and emits their `docker volume rm` commands —
proven by unit tests, no live docker/git.

## Tasks

- [ ] Add `packages/common/src/env/prune.js` exporting
      `planPrune(volumeNames, liveSlugs, config, flags)`.
- [ ] Compute `repoSlug`-based namespace and the protected-prefix set from
      `liveSlugs` (`${repoSlug}_${slug}_`); an orphan is any namespace volume not
      matching a protected prefix. Take `repoSlug` from `config`/`flags` (caller
      supplies it — keep the planner pure; no `repoInfo` IO here).
- [ ] Support optional `flags.olderThanDays` filtering against a caller-supplied
      `createdAt` per volume (accept `volumeNames` as `[{name, createdAt}]` or a
      parallel map — pick one shape and document it). Default off = no age filter.
- [ ] Return `{ orphans, commands }` where `commands = orphans.map(v => `docker
      volume rm ${v}`)`. Empty orphans → empty commands (clean no-op).
- [ ] Add `packages/common/test/env-prune.test.js` covering: exact-prefix safety
      (`add` does not protect `add-widget`), a live slug protected, a true orphan
      reaped, volumes outside the namespace ignored, empty inputs, and the
      `olderThanDays` cutoff. (`planPrune` only sees `liveSlugs` — the
      worktree-vs-registry liveness policy is the CLI's job, tested in Phase 2.)
- [ ] Run `node --test` from `packages/common` (and repo root) — green before the
      phase is done. No typecheck script exists; the suite is the gate.

## Notes

Mirror the pure-planner style of `env/teardown.js` (`planDown`): no `Date.now()`
— the caller passes any timestamps/`createdAt`. Slugs are kebab-case
(`[a-z0-9-]`) and `_` is the compose project/volume separator, which is why the
trailing `_` on protected prefixes yields an exact slug match.
