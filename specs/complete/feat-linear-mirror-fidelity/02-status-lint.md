---
linear_issue_id: "SKI-24"
---

# Phase 2 — Three-way phase-status lint, surfaced by the CLI ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a phase whose status signals are absent or disagree produces a visible
warning from `spec-sync normalize|push|status` instead of silently projecting as
`backlog`; proven by unit tests over `lintPhases` and CLI output tests.

## Tasks

- [x] **First — make the provider CLI runnable in a worktree.** A fresh worktree
      can't run `spec-sync` at all: `packages/linear/bin/skitterspec-linear.js`
      requires its own package by name
      (`@skitterbyte/skitterspec-provider-linear`), which only resolves via a
      root `node_modules/@skitterbyte/` link that the configured `setup`
      (`install --frozen-lockfile`) does not create. Tests still pass, so this
      hides until you invoke the CLI. Pick one: add the workspace packages to the
      root `package.json` devDependencies as `workspace:*` (reproducible, and the
      bin keeps exercising the same by-name resolution), or switch the source bin
      to relative requires (`scripts/build-dist.js:59` already rewrites them for
      the published dist, so there is no dist impact either way). Record the
      choice in the Changelog.
- [x] In `packages/sync-core/src/normalize.js`, have `readPhaseFiles` retain the
      raw H1 emoji (`null` when absent) and the `> **Status:**` line text
      alongside the existing fields. Leave `phaseStateBucket` semantics
      unchanged — no `Status:`-line fallback (Decision 1).
- [x] Add a pure `lintPhases(snapshotDir, config)` returning
      `[{ file, code, message }]`, with codes `missing-status-emoji` and
      `status-disagreement`. Reuse `parsePhaseIndex` for the overview row.
- [x] Implement the lenient `Status:`-line reading (Decision 5): emoji first,
      else the word map, else **skip the cross-check without warning**.
- [x] Export `lintPhases` from `packages/sync-core/index.js`.
- [x] Surface warnings in `packages/linear/src/cli-sync.js` for `normalize`,
      `push` and `status`: inline in human output, on **stderr** under `--json`
      so the plan stays parseable. Exit code stays 0 (Decision 4). Thread an
      `io.err` (defaulting to `process.stderr`) through `specSync`.
- [x] Tests in `packages/sync-core/test/`: no emoji → `missing-status-emoji`;
      H1 vs index-row mismatch → `status-disagreement`; H1 vs `Status:`-line
      mismatch → `status-disagreement`; unparseable `Status:` line → silent; all
      three agreeing → no warnings; a legacy bare-file spec → no crash.
- [x] Tests in `packages/linear/test/`: `push --json` writes the plan to stdout
      and warnings to stderr; human `status` lists warnings; exit code is 0 in
      both.
- [x] Run `pnpm test` — green before the phase is done.

## Notes

**Bootstrap fix: root `workspace:*`, not relative requires.** The two options
were not equivalent. `scripts/build-dist.js:50` (`rewriteRequires`) *depends* on
`packages/linear/bin` requiring this package by name: it maps
`@skitterbyte/skitterspec-provider-linear/src/…` onto `src/vendor/linear/…` for
the distribution layout. A relative require would pass through the rewriter
untouched and point at nothing in the dist. `packages/common/bin` gets away with
`require('../src/cli.js')` only because common's `src` flattens to the dist src
root. So the fix is the root devDependency; `--frozen-lockfile` still passes, so
`setup` bootstraps future worktrees correctly. Guarded by
`packages/linear/test/bin-resolves.test.js`, which spawns the real bin — every
other test in that package imports `../src/*.js` and so never loads it.

**A test caught a false positive in the word list.** `pending` was initially in
the not-started pattern, so a `> **Status:** pending review` line read as
not-started and warned confidently against a correct heading. Removed, with a
regression test. This is exactly the failure mode Decision 5 was written to
avoid, and it took a test to see it.

**Validated against the repo's own specs:** all 30 lint clean, so the lenient
`Status:` reading produces no false positives on real content.

The first task is a prerequisite, not a nice-to-have: every remaining phase
verifies its work by running `spec-sync` from this worktree.

Reproduce the field failure as a fixture: index row `✅`, a `**Status:** ✅ done`
line, and an H1 with no emoji. That spec must warn *twice over* — once for the
absent emoji, once for the disagreement.
