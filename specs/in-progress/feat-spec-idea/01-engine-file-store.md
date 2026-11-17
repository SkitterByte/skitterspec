---
github_issue_id: "#211"
---

# Phase 1 — Engine + file store, landed off base ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec idea add|list|drop` works with no provider: it writes
`specs/ideas.md` and lands it on base without dirtying the primary checkout.
Fixture tests prove this.

## Tasks

- [ ] Add `packages/common/src/idea.js`: parse and format `specs/ideas.md`,
      generate a unique slug id, and pure planners `planAdd` / `planDrop`.
- [ ] Land each change through a throwaway `--docs` worktree (commit, rebase,
      `merge --ff-only`, teardown). Refuse on a conflict and leave nothing
      standing.
- [ ] Add the store selector: ask `spec-sync idea --supports`, and use the
      file only on a positive "no" or when no provider is configured. Treat a
      failed probe as cannot-tell and refuse capture, printing the text back.
- [ ] Wire `idea add|list|drop` into `packages/common/src/cli.js` with
      `--json` and `--count`.
- [ ] Tests: round-trip the format, dedupe ids, add/drop on a git fixture
      with base unchanged in the primary tree, the conflict path, and two
      stays-silent cases: a missing `ideas.md` lists zero, and an unreachable
      provider does not fall back to the file. Run `pnpm test`. The phase is done only when it is green.
