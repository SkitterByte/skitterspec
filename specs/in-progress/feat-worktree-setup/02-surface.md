# Phase 2 — Surface: docs, example config, spec-go SKILL, rebuild dist ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the `setup` field is documented and shipped — visible in the config
docs and example, explained in the `spec-go` flow, and present in both rebuilt
distributions — proven by the build guard and a clean `node --test`.

## Tasks

- [x] **env.config.md** — documented `setup` as a jsonc block between `docker`
      and `dev`: bootstrap commands run in the worktree after `git worktree add`,
      before Docker/dev, on every provision including re-attach; token list and a
      `["pnpm install --frozen-lockfile"]` example; `[]` = none.
- [x] **env.config.json.example** — added `"setup": []`. (The example is strict
      JSON, so no inline comment — the `.md` carries the explanation and example.)
- [x] **skills/spec-go/SKILL.md** — added a "Bootstrap the worktree's
      dependencies" bullet in step 2 pointing at the `in the worktree, run:`
      commands from `env.config.json` → `setup`. Kept **tool-agnostic** (no
      `pnpm`) to satisfy the shipped-assets guard (`assets.test.js` FORBIDDEN).
- [x] **Rebuild distributions** — `pnpm run build`; `setup` verified present in
      both `packages/skitterspec` and `packages/skitterspec-linear`; no-bare-
      workspace-require guard passed.
- [x] **Tests** — `node --test` across the workspace: **248/248 pass**. Also
      ran the built base CLI live against this repo — the `in the worktree, run:`
      block prints correctly.

## Notes

Dogfooded: added `"setup": ["pnpm install --frozen-lockfile"]` to this repo's own
`specs/.core/env.config.json`, so future worktrees of skitterspec self-bootstrap
(directly fixing the reported pain). The shipped SKILL stays tool-agnostic; only
this operator config names pnpm.
