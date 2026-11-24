---
github_identifier: "#289"
github_url: "https://github.com/SkitterByte/skitterspec/issues/289"
---

# Bug: the bare `skitterspec` bin ignores a configured provider

> **Type:** Bug
> **Name:** bug-base-bin-provider
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/289
> **Author:** Reuben Greaves
> **Raised:** 2026-11-24
> **Area:** `packages/common/bin/skitterspec.js`, new `packages/common/src/provider.js`, a new `src/register.js` in each provider package (`azure-boards`, `github`, `jira`, `linear`) and their bins
> **Docs:** index

## Symptom

Reported from LSC App. Azure Boards is configured there
(`specs/.core/azure-boards.config.json`) and `land.specDocs` is unset.
`@skitterbyte/skitterspec` 23.23.2 and `@skitterbyte/skitterspec-azure-boards`
3.1.2 are both installed globally (Windows, nvm4w), with
`land.strategy: "pr"` and `baseBranchPattern: "20??/Q?"`:

```
> skitterspec spec-env integrate feat-x --docs
spec-env integrate: feat-x (pr)          # trunk lane: rebase + push + PR

> skitterspec-azure-boards spec-env integrate feat-x --docs
spec-env integrate: feat-x (spec docs ride the branch)
```

The skills call the bare `skitterspec`, so after `Commit & Start`,
`/spec-start` refuses:

```
spec-env up: blocked — feat-x is not committed in 2026/Q4 — it is on
feat/feat-x — the worktree would fork without the spec it is for.
```

This is the fork-point check that the branch lane skips. The reporter's
workaround is to set `land.specDocs: "branch"` explicitly.

The same gap reaches further than `specDocs`. Under the base bin,
`skitterspec idea` has no idea store registered, and the provider's env
defaults (`branch.identifierField`, `spec.companionPaths`) are missing.

## Root cause

`applyProviderSpecDocs` (`packages/common/src/env/config.js:974`) defaults
`specDocs` to `"branch"` only when `providerConfigFile` is set. Only a
provider's own bin calls `setProviderConfigFile`, along with
`setProviderEnvDefaults` and `setProviderIdeaStore`. #278 removed the
`skitterspec` alias from the providers, so the bare name always runs the
base bin, which registers nothing. A published provider carries its own
copy of the engine, so the base cannot just `require` the provider's bin.
The registration has to be handed the base's own modules.

## Failing test (red)

`packages/common/test/base-bin-provider.test.js`, "base bin: a configured
provider installed beside it puts spec docs on the branch lane". It runs
the base bin's `spec-env integrate feat-x --docs` in a fixture project with
`github.config.json`, where the workspace's github provider is installed
beside the base, as in a global install. It expects the branch lane
("nothing to publish"). Run with
`node --test packages/common/test/base-bin-provider.test.js`.

```
AssertionError [ERR_ASSERTION]: expected the branch lane, got:
spec-env integrate: feat-x has no worktree — nothing to integrate.
```

## Fix

- [x] Each provider package ships `src/register.js`, with
      `register({ envConfig, idea })` doing what its bin did inline. The
      provider's bin calls it with its own engine modules.
- [x] `packages/common/src/provider.js`: `registerConfiguredProvider`
      finds the project's provider config file, resolves that provider
      package beside the base or in the project, and calls its `register`
      with the base's modules. If more than one provider is configured, it
      registers nothing and warns. If the provider package can't be
      resolved, it warns and registers only the config file, so `specDocs`
      still defaults to `"branch"`.
- [x] The base bin calls it before `run`.
- [x] Unit tests for no provider, two providers and an unresolvable package.
      The failing test now passes (GREEN), and `pnpm test` shows no
      regressions.
- [x] `docs/index.html`: the global install note says the base picks up
      the configured provider.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | bare `skitterspec`: registers the configured provider (specDocs default, idea store, env defaults) |
| Service | add | `provider.js` `registerConfiguredProvider`; each provider's `src/register.js` |
| Config key | update | `land.specDocs`: provider default now reached through the base bin. This repo moves to `"branch"` (decided) |

## Changelog

- 2026-11-24 — Bug reproduced; failing test added (red). Decided: full
  registration over a specDocs-only default or restoring the alias (which
  would revert #278). This repo takes the `"branch"` default, with no
  trunk pin.
- 2026-11-24 — Fixed: the base bin registers the configured provider through
  its new `src/register.js`; test green, `pnpm test` 5413 passed. The jira
  idea-store test read the bin's source text, so it now calls `register`.
