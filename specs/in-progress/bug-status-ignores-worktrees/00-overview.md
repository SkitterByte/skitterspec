---
linear_identifier: "SKS-61"
linear_url: "https://linear.app/skitterbyte/issue/SKS-61/bug-spec-env-status-ignores-worktree-only-specs"
---

# Bug: spec-env status ignores worktree-only specs

> **Type:** Bug
> **Name:** bug-status-ignores-worktrees (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — fixed (test green)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-04
> **Area:** packages/common/src/cli.js, docs/index.html
> **Stack:** worktree

## Symptom

`spec-env status` reported `no provisioned specs` while a worktree was standing.
Observed in this repo, which has `docker.enabled: false`:

```
$ skitterspec spec-env status
spec-env: no provisioned specs.
$ git worktree list
/Users/…/skitterspec-wt/cli-engine-docs  [feat/cli-engine-docs]
```

The report is not merely incomplete — for a Docker-less project it is **always**
empty, so the command has never once told the truth there.

## Root cause

`specEnvStatus` (`packages/common/src/cli.js:189`) read only the slot registry:

```js
const registry = readRegistry(dir, config)
const names = Object.keys(registry.slots)
if (!names.length) { … 'no provisioned specs' … }
```

But `specEnvUp` allocates a slot **only when `wantsDocker`** — its own comment
says so: *"a worktree-only spec never touches the registry (no slot, no port
block)."* So the registry answers "which specs have a Docker port block", not
"which specs are provisioned", and in a project with Docker off it is
permanently empty.

This is the same wrong-signal defect corrected in `feat-script-only-commands`,
where zero-arg spec resolution was specified against the registry and had to be
moved to `git worktree list` for exactly this reason. `status` was left behind.

## Failing test (red)

`packages/common/test/cli-spec-env-status.test.js` — run with
`node --test packages/common/test/cli-spec-env-status.test.js`.

Before the fix, three of five failed:

```
✖ status lists a worktree-only spec in a project with Docker off
✖ status shows the worktree path, since that is what provisioned means
✖ status lists every provisioned spec, not just the first
```

The two **stays-silent** tests passed before the fix as well as after — which is
the point of them: they prove the new listing does not start naming things that
are not provisioned (a bucketed spec with no worktree, or the primary checkout).

## Fix

- [x] Rewrite `specEnvStatus` to enumerate specs that own a git worktree, via the
      existing `liveWorktreePaths` + `allSpecs` pair — the same authority
      `soleProvisionedSpec` already uses.
- [x] Keep reading the registry, but only to **annotate** a spec that has a slot
      with its port block. It is the authority on ports and nothing else.
- [x] Print the worktree path under each spec, since that is what "provisioned"
      now means.
- [x] Name the blind spot in a comment: a worktree removed behind git's back stays
      listed until `git worktree prune`. That over-reports, which is the harmless
      direction for a read-only report.
- [x] Failing tests now pass (GREEN); `pnpm test` — **1268 green**.
- [x] Update `docs/index.html`: the caveat shipped in `feat-cli-engine-docs`
      described this defect as behaviour, and is now wrong. Replaced with what
      `status` actually counts, and corrected the table row.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env status` lists worktree-owning specs, not slots |
| Docs | update | `index.html` — caveat replaced; table row corrected |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-04 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-04 — Bug reproduced; failing test added (red).
- 2026-09-04 — Fixed: status enumerates worktrees, registry annotates ports only.
- 2026-09-04 — Removed the docs caveat this defect had earned itself a day earlier;
  documenting a bug is not the same as fixing it, and the page now describes real
  behaviour.
