---
github_identifier: "#329"
github_url: "https://github.com/SkitterByte/skitterspec/issues/329"
---

# Bug: a local install dirties tracked specs/.core templates on update

> **Type:** Bug
> **Name:** bug-local-install-templates
> **Author:** Reuben Greaves
> **Raised:** 2026-11-26
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/329
> **Area:** `packages/common/src/init.js` (`localManagedPaths`, `convertCommitted`, `uninstall`), `packages/common/src/cli.js` (uninstall help)
> **Docs:** reference

## Symptom

Reported from a consumer repo installed with `init --local` (manifest
`scope: "local"`):

> I ran skitterspec-azure-boards update after upgrading from 23.24.5 to
> 23.24.8. It rewrote specs/.core/env.config.md, a tracked file: git status
> showed `M specs/.core/env.config.md` (+18 −6, the new prune wording).

The consumer had 7 such files, all tracked from before the switch to a
local install.

## Root cause

`localManagedPaths()` (`packages/common/src/init.js:1465`) filtered out every
`specs/` path, so the `specs/.core` templates (`SETUP.md`,
`*.config.json.example`, `*.config.md`) were in neither `localExcludes()` (the
`.git/info/exclude` block) nor `localSeedFiles()` (worktree bootstrap). The
manifest still records them as managed and `update` rewrites them, so a fresh
local install left them visible to git, and the first upstream template
change dirtied the consumer's tree. The comment above it said "every managed
file", so the code contradicted it.

## Failing test (red)

`packages/common/test/init-local.test.js`, `bug-local-install-templates`
block. Run with `node --test packages/common/test/init-local.test.js`.

- *a local install update across a template change leaves git status clean*.
  Red: `+ [ 'specs/.core/env.config.md' ]` where `[]` was expected.
- *every managed template is excluded and seeded; live configs never are*.
  Red: `env.config.json.example excluded`.
- *an already tracked template is reported with the command, never
  untracked*. Red: `one warning, not one per file` (there was no warning).
- *stays silent: a team install update across a template change*. Green
  before and after.

## Fix

- [x] Drop the `specs/` filter in `localManagedPaths()`, so every managed
      template is excluded and seeded. The live configs are not managed, so
      they are never listed.
- [x] `convertCommitted()`: report a managed template git already tracks in
      one warning that names `git rm --cached -- <paths>`, and leave the index
      alone. A template in `specs/` may be committed on purpose, so this is a
      cannot-tell. Templates are also left out of the long-lived-branch
      "still commits the install" report for the same reason.
- [x] `uninstall`: remove or park the untracked templates along with the rest,
      so `git status` stays unchanged once the exclude block goes. Tracked
      ones stay, and so does everything if git can't be reached.
- [x] Failing tests pass (GREEN); `pnpm build` and `pnpm test` are green.
- [x] `docs/reference.html` (`init --local`, `uninstall` rows) updated and
      verified.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | update | `.git/info/exclude` skitterspec block lists `specs/.core` templates |
| CLI command | update | `update` / `init --local`: warning naming `git rm --cached -- <paths>` for tracked templates |
| CLI command | update | `spec-env bootstrap`: seeds `specs/.core` templates into a local install's worktrees |
| CLI command | update | `uninstall`: removes untracked `specs/.core` templates |

## Changelog

- 2026-11-26 — Bug reproduced; failing tests added (red).
- 2026-11-26 — "Warns once" read as one warning listing every tracked
  template, repeated on each update while any is still tracked, as the
  long-lived-branch report already does. It is not a one-time notice.
- 2026-11-26 — Fixed: templates are managed paths under local scope; tracked
  ones are reported, never untracked; uninstall takes the untracked ones.
  Tests green.
- 2026-11-26 — Completed; fix done, tests green. docs/index.html re-read for
  the completion check: still right, stamped.
