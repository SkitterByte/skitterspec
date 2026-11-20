---
github_issue_id: "#279"
---

# Phase 1 — Providers drop the alias; the base answers `skitterspec` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** Two providers and the base install globally side by side, and every
command and skill in a provider project still reaches `skitterspec` (proven by
a global-install test into a scratch prefix and by the launcher tests).

## Tasks

- [ ] Remove the `skitterspec` bin from `packages/{github,linear,jira,azure-boards}/package.json`
      and from the four `packages/skitterspec-*/package.json` distributions;
      keep `skitterspec-<provider>`.
- [ ] Map bin → package in the launcher (`init.js` `LAUNCHER`/`launcherFor`):
      `K` derives from the bin name rather than `distributionPackage()`.
- [ ] Make the PATH rung check for the named bin (`hasPathInstall`), and the
      local rung check for `skitterspec` itself when a command needs it.
- [ ] Record `distribution` in the manifest on every write (decision 8).
- [ ] Warn in `init`/`update` when `skitterspec` cannot be found in a provider
      project, naming the install to add (decision 5).
- [ ] Warn in `update` when the base's version differs from the provider's
      (decision 3); stays silent when they match or when the base can't be
      asked.
- [ ] Rewrite the binary-name contract paragraph in `spec-planning.md`
      ("one entry point under two names" → the base answers `skitterspec`).
- [ ] Tests: two fake providers plus the base `npm i -g --prefix <scratch>`
      without EEXIST; the launcher finds `@skitterbyte/skitterspec` beside a
      provider; stays-silent tests for a root-layout team install (renders as
      today) and for matching versions (no warning).
- [ ] Run `pnpm test`, green.

## Notes

The hooks' `ENGINES` list already searches all five names, so they need no
change. Confirm that by test rather than assuming it.
