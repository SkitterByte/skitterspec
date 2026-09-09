---
linear_issue_id: "SKS-90"
---

# Phase 4 — Retire /spec-go ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** no shipped surface names `/spec-go`; upgrades remove it; history says
where it went.

## Tasks

- [x] Delete `packages/common/assets/skills/spec-go/` and add it to `init`'s
      retired-files removal so `skitterspec update` deletes the installed copy.
- [x] Rename the provider seam `spec-go-start` → `spec-next-start`: the marker in
      the (new) spec-next skill and `packages/linear/assets/seams/spec-go-start.md`
      move together in one commit — a build-time contract, and the compose
      guards fail loudly on a half-rename.
- [x] Sweep the remaining references (24 files at spec time — re-grep, don't
      trust the count): every skill's prose and template headers ("the handle
      you paste into `/spec-start`"), `spec-planning.md`, `claude-md-section.md`
      (currently 0 — keep it so), READMEs, `env.config.md`, linear SETUP/config
      docs, and the engine's user-facing messages in `cli.js`/`live.js`/
      `teardown.js` ("run /spec-go first" → `/spec-start`).
- [x] Write the MIGRATION.md entry (spec-go → spec-start + spec-next, with the
      one-line why) and copy-through via the existing build step.
- [x] Add `spec-go` to `RETIRED_SKILLS` in `docs-claims.test.js` — MIGRATION.md
      stays outside SURFACES, so documenting the removal stays sayable — and
      update the spec-init enumeration (the counting test forces this).
- [x] Run `pnpm build` + full `pnpm test`; the assets-prose guard ("every
      /spec-… named ships") is the mechanical straggler-sweep — green before the
      phase is done. Major version bump noted for the next release.

## Notes

**52 files, not 24.** The spec's estimate counted assets and engine source; the
real surface added tests, the docs site, both dist READMEs and the `.claude`
dogfood symlink. Re-grepping first was what made the sweep finishable.

**What was deliberately left alone:** `MIGRATION.md`, `CHANGELOG.md`,
`RELEASES*.md`, the READMEs' version-history sections, and every spec under
`specs/complete` and `specs/cancelled`. Those describe what past versions did
and are correct as written — the retired-skill guard excludes them by shape
(it matches a skill-table ROW, not the name) and by scanned-surface list.

**`RETIRED_FILES` needed no entry.** `pruneRetiredManaged` already deletes any
managed file the package no longer ships, keeping one the user edited with a
warning — so an upgrade removes `/spec-go` without a hardcoded path.
