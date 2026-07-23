# Phase 2 — Surface: docs, example config, spec-go SKILL, rebuild dist ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the `setup` field is documented and shipped — visible in the config
docs and example, explained in the `spec-go` flow, and present in both rebuilt
distributions — proven by the build guard and a clean `node --test`.

## Tasks

- [ ] **env.config.md** — document `setup`: an array of bootstrap commands run
      in the worktree right after `git worktree add` (before Docker/dev), on
      every provision including re-attach; `{slug}`/`{branch}`/`{worktreePath}`/
      `{projectName}`/`{portOffset}` expand; `[]` = none. Place it near `dev`.
- [ ] **env.config.json.example** — add `"setup": []` with a one-line comment and
      a commented example (`// e.g. ["pnpm install --frozen-lockfile"]`).
- [ ] **skills/spec-go/SKILL.md** — in step 2 (provisioning), note that
      `spec-env up` also runs the project's `setup` commands to bootstrap the
      worktree's dependencies (so husky hooks, typecheck, build, and tests work),
      and that a project enables it via `env.config.json` → `setup`.
- [ ] **Rebuild distributions** — run `pnpm run build` (`node scripts/build-dist.js
      all`); confirm the `setup` handling lands in `packages/skitterspec` and
      `packages/skitterspec-linear` and the no-bare-workspace-require guard passes.
- [ ] **Tests** — run `node --test` across the workspace; green before done. (No
      new test files here — Phase 1 covers behaviour; this phase is docs + build,
      guarded by the build script and existing suite.)

## Notes

`env.config.json` in this repo's own `specs/.core/` may optionally gain a real
`setup` (e.g. `pnpm install`) so the tool dogfoods the feature — but that's an
operator config change, not part of shipping the feature. Decide at build time.
