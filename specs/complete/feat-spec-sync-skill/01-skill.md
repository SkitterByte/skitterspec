# Phase 1 — The `/spec-sync` skill, and the `verify` footgun guard ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a `/spec-sync` skill that answers a bare "run spec-sync" with the
repo-wide overview and routes plain language to the right subcommand, proven by
asset tests over its SKILL.md plus an engine test for the `verify` guard.

## Tasks

- [x] Add `packages/linear/assets/skills/spec-sync/SKILL.md` with frontmatter
      `name` + `description` matching the style of the sibling `spec-push` /
      `spec-status` skills. No manifest edit needed — `listSkills()`
      (`packages/common/src/init.js:43`) discovers it.
- [x] Document the opt-in gate (`specs/.core/linear.config.json` must exist) and
      the exact invocation, `pnpm exec skitterspec-linear spec-sync …`, naming
      that the binary is a local devDependency and is not on PATH.
- [x] Route bare `/spec-sync` → `linked`, and cover `states`, `projects`,
      `verify`, `stamp`, `apply --all <bucket>`.
- [x] Defer explicitly to `/spec-push` (single-spec push/apply) and
      `/spec-status` (per-spec drift) rather than duplicating them.
- [x] Require confirmation before `apply --all`, stating **create and update counts separately**
      — a create mints new objects in the tracker.
- [x] Guard `verify` in the engine: `spec-sync verify --stored` refuses a path
      under `sync.baseDir` or matching `*.base.json`, naming what the file
      actually is (content hashes, not descriptions) and what `--stored` wants.
- [x] Extend `packages/linear/test/assets.test.js` — add `spec-sync` to the
      "sync skills ship in the linear package" list, and assert the SKILL.md
      states the full invocation, defers to `/spec-push`, and splits
      create/update in its `--all` confirmation.
- [x] Add an engine test for the `--stored` snapshot refusal in
      `packages/linear/test/cli-verify.test.js`; run `pnpm test` — green before
      the phase is done.

## Notes

The `--all` confirmation is the one real blast radius here. In `~/code/ereqs`
every backlog spec reports "N to create", so a careless run mints dozens of
sub-issues in a shared Linear workspace.

`spec-sanitise` ships no skill, so `/spec-sync` is not expected to cover it.
