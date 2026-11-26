---
github_identifier: "#318"
github_url: "https://github.com/SkitterByte/skitterspec/issues/318"
---

# Bug: prune offers to delete the primary checkout's live volumes

> **Type:** Bug
> **Name:** bug-prune-reaps-base-volumes
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/318
> **Author:** Reuben Greaves
> **Raised:** 2026-11-26
> **Area:** `packages/common/src/env/prune.js` (`planPrune`), `packages/common/src/cli.js` (`specEnvPrune`, `listRepoVolumes`), `/spec-complete` and `/spec-cancel` SKILL.md
> **Severity:** 1 - Critical
> **Docs:** reference

## Symptom

Reported from ereqs (23.24.5, `docker.enabled: false`,
`projectNamePattern: "{repoSlug}_{slug}"`). The primary checkout's own
`docker-compose.yml` declares external, explicitly named volumes
(`ereqs_db_data`, `ereqs_seq-data`, `ereqs_azurite-data`), unlabelled, two of
them mounted by the running dev stack:

```
$ skitterspec spec-env prune
spec-env prune: 3 orphaned volume(s) (17 live spec(s) protected)
  orphans:
    ereqs_azurite-data
    ereqs_db_data
    ereqs_seq-data
  backup:       none (prune does not back up — orphans have no running DB)
  run these:
    docker volume rm ereqs_azurite-data
    docker volume rm ereqs_db_data
    docker volume rm ereqs_seq-data
```

`/spec-complete` §7.4 and `/spec-cancel` offer these on every run. One "yes"
deletes the dev database; only Docker refusing an in-use volume stood in the
way, and `ereqs_azurite-data` was not mounted.

## Root cause

`planPrune` (`packages/common/src/env/prune.js:53`) treats every volume whose
**name** starts `{repoSlug}_` as a spec volume, and every one not protected by
a live slug's prefix as an orphan — an absence (no matching worktree) taken as
proof without any positive signal that a spec stack ever owned it
(`negative-checks.md` rule 1). `specEnvPrune` (`cli.js:3155`) feeds it bare
names from `docker volume ls --filter name=…`, never asks whether a container
mounts the volume, ignores `docker.enabled`, and prints "orphans have no
running DB" unchecked.

## Failing test (red)

`packages/common/test/env-prune.test.js` — eight stays-silent planner tests
(unlabelled prefix-sharing volume, base-project label, a name the base compose
file uses, mounted, use unknown, a bare name, a `{slug}`-less pattern, a custom
pattern). `packages/common/test/cli-spec-env-prune.test.js` — four CLI tests
against a fake `docker` on PATH (POSIX only): `docker.enabled: false`, the
ereqs shape, a mounted spec volume, docker failing mid-way.

```
node --test packages/common/test/env-prune.test.js packages/common/test/cli-spec-env-prune.test.js
✖ external, explicitly named base-stack volumes are never offered
  'spec-env prune: 3 orphaned volume(s) (0 live spec(s) protected)\n' …
    '    docker volume rm ereqs_db_data\n' +
```

## Fix

- [x] `specEnvPrune`: with `docker.enabled: false`, say Docker is not in use
      and ask docker nothing
- [x] Candidates need a positive signal: list volumes by the
      `com.docker.compose.project` label and match it against
      `docker.projectNamePattern` with `{slug}` as the wildcard; a bare name
      never qualifies
- [x] Never a candidate: a volume referenced by any container, running or
      stopped (`dangling=true` is the positive signal), or one whose name the
      base compose file mentions
- [x] Cannot-tell (a docker call failing, a pattern without `{slug}`) lists
      nothing and warns
- [x] The `backup:` line states what was checked
- [x] `/spec-complete` and `/spec-cancel` text, `env.config.md`, `docs/reference.html`
- [x] Tests green; `pnpm build` and `pnpm test` pass

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env prune` — label + unmounted required; honours `docker.enabled` |
| Skill/rule | update | `/spec-complete` §7.4, `/spec-cancel` prune step |

## Changelog

- 2026-11-26 — Bug reproduced from the ereqs handoff; failing tests added (red).
- 2026-11-26 — Fixed: candidates need a spec project's compose label and
  docker's `dangling` answer, base compose names are kept, `docker.enabled:
  false` asks docker nothing; also `env.config.md` (asset and dogfood copy)
  now describes the rule; tests green (4618 pass).
- 2026-11-26 — Completed; fix done, tests green. `index.html` re-read (no prune content) and stamped.
