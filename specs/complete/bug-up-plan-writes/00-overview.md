---
github_identifier: "#152"
github_url: "https://github.com/SkitterByte/skitterspec/issues/152"
---

# Bug: `spec-env up --plan` writes the trust entry it says it won't

> **Type:** Bug
> **Name:** bug-up-plan-writes (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/152
> **Author:** Reuben Greaves
> **Raised:** 2026-11-10
> **Area:** packages/common/src/cli.js (`specEnvUp`), packages/common/src/env/trust.js
> **Severity:** 3 - Medium
> **Docs:** none: no docs page describes `up --plan`; the CLI usage text is updated in the fix

## Symptom

Reported from the LSC adopter on Windows:

> spec-env up --plan prints "nothing created yet", but it still writes
> `C:\Code\LSC App-wt` into .claude/settings.local.json under
> additionalDirectories. My test triggered that, so I removed the line with Edit
> (git restore was blocked). Plan mode should write nothing.

Repro: on any isolated project, run `skitterspec spec-env up <spec> --plan` with
no `.claude/settings.local.json`. That file then exists and lists the worktree
root. With an unwritten `bug-`/`feat-` name and `--docs`, the registry also
gains an authoring record. A Docker spec also gets a registry slot.

## Root cause

`--plan` is parsed globally (`packages/common/src/cli.js`, the `spec-env` flag
loop) but `specEnvUp` never reads it. `up` is a planner for the worktree, but it
has three writes of its own: the trust entry (`ensureWorktreeDirTrusted`), the
authoring record (`writeRegistry(… recordSpecless …)`), and the Docker slot
(`writeRegistry(… alloc.registry)`). `--plan` skipped none of them, so the
dry-run flag did nothing, under a header saying "nothing created yet".

## Failing test (red)

`packages/common/test/cli-spec-env-up.test.js`:

- `spec-env up --plan writes nothing — no trust entry, no registry`
- `spec-env up --plan on an unwritten spec records no authoring branch`
- `STAYS SILENT: --plan reports an already-trusted root as already in`

Red before the fix: `AssertionError: no settings file` and
`AssertionError: no registry`.

## Fix

- [x] `ensureWorktreeDirTrusted(dir, root, { dryRun })` answers without
      writing; `changed` then means "would change".
- [x] `specEnvUp` honours `--plan`: no trust write, no authoring record, no
      Docker slot. The report says `would add to` instead of `added to`.
- [x] Usage text names `up --plan`.
- [x] The failing tests pass. `pnpm test` gives 4668 passed, and
      `pnpm test:nested` gives 167 passed.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env up --plan` writes nothing; reports `would add to` |
| Service | update | `ensureWorktreeDirTrusted` takes `{ dryRun }` |

## Changelog

- 2026-11-10 — Bug reproduced; failing test added (red).
- 2026-11-10 — Fixed: `up` honours `--plan` for all three writes; tests green.
- 2026-11-10 — Left alone: a bare `up` still writes the trust entry and the
  records. The skills rely on that (`/spec-start` step 2), and its `trusted:`
  and `recorded:` lines already say "added to".
- 2026-11-10 — Completed; fix done, tests green (4668, nested 167).
