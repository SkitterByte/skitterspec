---
linear_identifier: "SKS-400"
linear_url: "https://linear.app/skitterbyte/issue/SKS-400/bug-spec-env-bootstrap-never-seeds-a-no-spec-worktree"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: `spec-env bootstrap` never seeds a `/no-spec` worktree

> **Type:** Bug
> **Name:** bug-nospec-bootstrap-seeds (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-10-21)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-21
> **Area:** packages/common/src/cli.js, packages/common/assets/skills/no-spec/SKILL.md
> **Stack:** worktree

## Symptom

For a specless (`/no-spec`) record, `spec-env bootstrap` ran `setup` and skipped
every `seedFiles` entry. Reported from ereqs on 2026-10-20 against
skitterspec-linear 18.0.0, where `seedFiles` is `[".env", ".local-secrets.jsonc"]`
and `setup` includes `pnpm run db:generate`:

```
pnpm exec skitterspec-linear spec-env bootstrap --plan
#  1. setup: pnpm install --frozen-lockfile
#  2. setup: pnpm run db:generate          <- no seed steps
pnpm exec skitterspec-linear spec-env bootstrap
#  stopped at step 2 of 2 (setup: pnpm run db:generate)
#  Prisma CLI: none of DATABASE_URL / ... is set
```

So no `/no-spec` worktree there could typecheck or test, and the skill requires
both before it renders a page. The v23 migration entry says bootstrap seeds
first, and gives no exception for `/no-spec`.

## Root cause

`specEnvBootstrap` in `packages/common/src/cli.js` (the `spec.specless &&
!spec.unwritten` branch) built its steps by hand from `config.setup` and never
called `worktreeSteps` (`packages/common/src/env/provision.js`), which is
where seed steps and setup token expansion come from. That was carried over from
17.5's `nospec`, which printed no seed lines either. `feat-engine-bootstrap`
kept the behaviour unchanged and wrote a test pinning it ("nospec seeds
nothing"). Separately, `specEnvNospec` printed the `bootstrap` hand-off only
when `setup` was non-empty, so a project with seeds and no `setup` was never
told to bootstrap.

## Failing test (red)

`packages/common/test/cli-spec-env-bootstrap.test.js` and
`packages/common/test/cli-spec-env-nospec.test.js`. Run with
`node --test <file>`.

- `specless (/no-spec) work seeds the gitignored files, then runs setup`: `setup` checks that the seeded file exists. Red: `actual: 1, expected: 0`.
- `specless plan orders seed before setup, with no envFile or docker step`: red, `actual: ['setup'], expected: ['seed','seed','setup']`.
- `specless --docs seeds and skips setup, as a spec does`: red, `actual: []`.
- `seeds alone still earn the bootstrap line — no setup needed`: red, no `then, run:` line.
- Stays-silent tests, green before and after the fix:
  - specless with no seedFiles plans exactly its setup steps;
  - nospec with neither seeds nor setup prints no bootstrap line.

## Fix

- [x] The specless branch calls `worktreeSteps(spec, null, config, { docs, wantsDocker: false })`. That gives seed → setup, `--docs` seeds only, never an envFile or docker step, and setup tokens get expanded.
- [x] `nospec` prints the `bootstrap` hand-off when seeds or setup exist.
- [x] `/no-spec` SKILL.md says bootstrap seeds and then runs setup, and that there is no stack.
- [x] Failing tests pass (GREEN); full suite green.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env bootstrap` on a specless record seeds `seedFiles` before `setup` |
| CLI command | update | `spec-env nospec` prints `then, run: … bootstrap` when seeds alone exist |
| Skill/rule | update | `/no-spec` §2 describes the seeding |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-21 | In Progress | in-progress | Reuben Greaves |
| 2026-10-21 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-10-21 — Bug reproduced from the ereqs handoff; failing tests added (red).
- 2026-10-21 — Fixed: specless bootstrap goes through `worktreeSteps` with no stack, and the nospec hand-off counts seeds; tests green.
- 2026-10-21 — Completed; all phases done, tests green.
