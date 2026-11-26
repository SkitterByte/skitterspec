---
github_issue_id: "#321"
---

# Phase 2 — integrate names another spec's commits ✅

> **Status:** Done

**Goal:** a branch that already carries another spec's commits, from before
phase 1 or from a fork made by hand, is caught before the fast-forward, never
after it.

## Tasks

- [x] RED — `cli-spec-env-integrate-foreign.test.js`: feat/next forked from
      feat/live's tip with its own commit. `integrate feat-next` refuses before
      any rebase or ff, naming both live commits (short sha + subject) and
      `feat-live` as their owner, and main does not move.
- [x] **Refuses on one signal, the branch's creation point.** Its oldest reflog
      entry is where it was created. When that commit is not on the base, the
      commits in `base..<created>` were there before the branch existed.
      `foreignCommits` (cli.js) reads it, and `planIntegrate` refuses with the
      commits, the owner (the spec whose branch holds the creation point,
      through `branchToSpec`), and the exit: land the owner first, or
      `rebase --onto <base> <created>`.
- [x] **Warns, never refuses**, on a `Refs:` naming another ticket than the
      spec's own, or a commit touching another spec's folder and not its own.
      Both can be deliberate (commit-trailers.md: a spec written part-way
      through another lands on that branch), so neither is proof.
- [x] Cannot-tell is silent: no reflog, a resumed branch (`Created from
      <remote>/<branch>`, its own image), a rolled base (`retarget.from`
      subtracted), a hotfix (`baseRef`), a real rebase that rewrote the shas.
- [x] Stays-silent tests: a branch forked from the base with a spec live
      elsewhere; a resumed branch; a commit with the spec's own `Refs:`; the
      offered `rebase --onto` then lands cleanly. The existing rolling-base
      integrate tests cover the retarget case.
- [x] Update `docs/reference.html` `spec-env integrate` row; `verify reference`.
- [x] GREEN — `pnpm test`: 4616 passed, 0 failed.
