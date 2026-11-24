---
github_identifier: "#313"
github_url: "https://github.com/SkitterByte/skitterspec/issues/313"
---

# Bug: a bare `skitterspec update` writes the base set over a provider's files

> **Type:** Bug
> **Name:** bug-base-update-clobbers-provider (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/313
> **Author:** Reuben Greaves
> **Raised:** 2026-11-24
> **Area:** packages/common/src/provider.js, packages/common/bin/skitterspec.js, packages/common/src/updateall.js
> **Docs:** index

## Symptom

Reported from a solo-path project (ereqs: `init --local`, no skitterspec
dependency, `specs/.core/azure-boards.config.json` present), with
`@skitterbyte/skitterspec` 23.24.3 and `@skitterbyte/skitterspec-azure-boards`
3.2.3 installed globally:

1. `skitterspec-azure-boards update` → no changes.
2. `skitterspec update` → removes the provider-only skills (`spec-azure-setup`,
   `spec-claim`, `spec-list`, `spec-push`, `spec-status`, `spec-sync`),
   rewrites the shared skills to the base text without their tracker seams
   (`spec-next/SKILL.md` goes from 4 `spec-sync` mentions to 0), deletes
   `specs/.core/SETUP.md`, `azure-boards.config.json.example` and
   `azure-boards.config.md`, and rewrites `env.config.json.example` and
   `env.config.md` to the base defaults — reporting nothing.
3. `skitterspec-azure-boards update` puts it all back.

Every provider's `MIGRATION.md` tells solo-path projects to run
`skitterspec update` (step 5) and `skitterspec update --all` after every
release, so every provider project following it silently lost its tracker
skills.

## Root cause

`init.js` installs from `ASSETS = path.join(__dirname, '..', 'assets')` — the
running distribution's own set — and writes `distribution: <its package>` into
the manifest. 23.24.x taught the base bin to find the configured provider
(`src/provider.js`) for engine verbs (`registerConfiguredProvider`) and for
`spec-sync` (`forwardProviderCommand`), but `init`, `update`, `enable` and
`uninstall` still ran the base's own install against the base asset set, so
`resync` pruned every provider-managed file as retired.

`update --all` was safe on a clean manifest (it runs each project's recorded
distribution), but `distributionOf` trusted `manifest.distribution` first, and
step 2 above rewrote that to the base — after which `--all` kept running the
base.

## Failing test (red)

`packages/common/test/base-bin-install-provider.test.js` — per active provider
(github, azure-boards; linear and jira are parked, so not built or tested):
after `skitterspec-<p> init --local` + `update`, a base `skitterspec update`
must leave the tree byte-identical, the provider-only skills present,
`spec-next` still naming `spec-sync`, and the manifest naming the provider;
base `init` must write the same tree as the provider's `init`. Also: provider
configured but not installed → refused, nothing written; two providers
configured → refused, nothing written; no provider → base install, silent;
`distributionOf` prefers a configured provider over the manifest.

```
✖ base bin: update in a azure-boards project leaves exactly what skitterspec-azure-boards update leaves
-   '.claude/rules/commit-trailers.md': '25024e36…',
ℹ pass 2
ℹ fail 7
```

## Fix

- [x] `forwardInstallCommand` in `src/provider.js`: `init`, `update` (not
      `--all`), `enable` and `uninstall` in a project with one provider
      configured run that provider's published bin; not installed, or two
      configured → refused with a named package, nothing written
- [x] Base bin calls it for the install verbs, on the verb's target dir
- [x] `distributionOf` (`update --all`): a single configured provider wins over
      the manifest's recorded distribution
- [x] `docs/index.html` names `init`/`update` among what the bare bin picks up
- [x] Failing test now passes (GREEN); full suite green
- [x] `MIGRATION.md` stays correct as written: steps 3 and 5 and `update --all`
      now reach the provider

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `skitterspec init/update/enable/uninstall` in a provider project → provider's bin, or refused |
| CLI command | update | `skitterspec update --all` picks the configured provider over the manifest |

## Changelog

- 2026-11-24 — Bug reproduced; failing test added (red).
- 2026-11-24 — Fixed: install verbs forward to the provider's published bin,
  refuse when it is missing or ambiguous; `--all` trusts the config; test green.
- 2026-11-24 — Follow-up surfaced: a fresh worktree's `pnpm install` fails —
  the parked `skitterspec-jira`/`-linear` `prepare` scripts throw from
  `build-dist.js`; not in scope here.
