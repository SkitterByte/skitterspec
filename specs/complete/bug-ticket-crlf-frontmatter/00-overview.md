---
github_identifier: "#323"
github_url: "https://github.com/SkitterByte/skitterspec/issues/323"
---

# Bug: frontmatter on a CRLF checkout reads as absent

> **Type:** Bug
> **Name:** bug-ticket-crlf-frontmatter (the spec folder name — the handle you paste into `/spec-start`)
> **Author:** Reuben Greaves
> **Raised:** 2026-11-26
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/323
> **Area:** packages/common/src/env/resolve.js, packages/common/src/env/resume.js, packages/sync-core/src/normalize.js, packages/sync-core/src/write.js
> **Severity:** 2 - High
> **Stack:** worktree
> **Docs:** none: no page describes how frontmatter is parsed or which line endings it accepts

## Symptom

release.yml's Windows job failed on `skitterspec@23.24.7`, so nothing was
staged:

```
✖ integrate: another ticket's Refs or another spec's folder warns, and still plans
  AssertionError: The input did not match /warning: {3}[0-9a-f]+ other ticket — Refs: #9, not this spec's #7/
  '  warning:   3dc5e3d tick a phase of live — touches feat-live, not feat-next\n'
```

The folder warning printed and the `Refs:` warning did not. The spec's own
ticket had read as null.

## Root cause

Five frontmatter readers matched the fence with a bare `\n`:
`readTicket` and `readFrontmatterField` (`env/resolve.js:191`, `:353`),
resume's `frontmatterField` (`env/resume.js:95`), and sync-core's
`parseFrontmatter` (`normalize.js:28`) and `splitFrontmatter` (`write.js:33`).
Git for Windows checks text out as CRLF under `core.autocrlf=true` (its
installer's default, and the runner's), so on those machines every stamped
spec read as having no frontmatter. Beyond the test, that meant: `integrate`
skipped its `Refs:` check, an `{identifier}` branch pattern fell back to
`{type}/{slug}`, `/spec-resume #N` could not find the spec, a push would read a
linked spec as unlinked and plan creates, and a stamp prepended a second
frontmatter block.

## Failing test (red)

- `packages/common/test/env-frontmatter-crlf.test.js`: `readTicket`,
  `readFrontmatterField`, `branchFor` with `{identifier}`, and resume's
  `frontmatterField`, each on CRLF text. 4 red, 1 stays-silent green.
- `packages/sync-core/test/sync-frontmatter-crlf.test.js`: `parseFrontmatter`,
  `splitFrontmatter`, `writeFrontmatter` (one block, CRLF kept) and
  `deleteFrontmatter` on CRLF. 4 red, 1 stays-silent (LF stays LF) green.
- `cli-spec-env-integrate-foreign.test.js`: the CI case under
  `core.autocrlf=true`, which reproduces the Windows failure on any OS. Red
  before the fix.

## Fix

- [x] Accept `\r?\n` at both fences in all five readers, and split frontmatter
      lines on `/\r?\n/`.
- [x] `splitFrontmatter` returns the file's `eol`; `writeFrontmatter` and
      `deleteFrontmatter` write it back, so a CRLF file stays CRLF and an LF
      file stays LF.
- [x] GREEN: the three tests pass; `pnpm test` 4642 passed, 0 failed.

## Impact

_No external surface changes — internal refactor only._

## Changelog

- 2026-11-26 — Bug reproduced from release.yml's Windows failure on
  skitterspec@23.24.7; failing tests added (red). The audit found the same
  LF-only fence in four more readers, sync-core's two included, and they are
  fixed here because the cause is the same.
- 2026-11-26 — Fixed: CRLF-tolerant fences and an eol-preserving write; tests
  green (4642 passed).
- 2026-11-26 — Completed; fix in, tests green (4642 passed).
