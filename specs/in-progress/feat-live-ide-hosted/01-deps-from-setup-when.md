---
github_issue_id: "#199"
---

# Phase 1 — Dependency changes from `setup` `when` globs ⬜

> Spec: [00-overview.md](00-overview.md)

**Goal:** `live take` warns about restarting on any file the project's `setup`
`when` globs name, proven by tests on a .NET-shaped config.

## Tasks

- [ ] Replace `DEPS_RE` (`cli.js:7075`) with a pure `depsChanged(files, config)`
      in `env/live.js`: match `config.setupTriggers` globs via `globToRegExp`, and
      fall back to the npm/pnpm/yarn list when no `when` globs are declared
- [ ] Wire it into `specEnvLiveTake`
- [ ] Tests in `env-live.test.js`: a `**/*.csproj` `when` glob fires on
      `src/Api/Api.csproj`. Add a stays-silent case where an unrelated `.cs`
      change says nothing, and an npm-fallback case with no `when` globs
- [ ] Update the `live` and `setup` comments in
      `packages/common/assets/core/env.config.md` (the `when` globs now also
      drive the live restart warning); bump `docs/reference.html` if it
      describes the warning
- [ ] Run typecheck + `pnpm test` — green before the phase is done
