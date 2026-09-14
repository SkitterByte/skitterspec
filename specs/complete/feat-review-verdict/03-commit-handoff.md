---
linear_issue_id: "SKS-170"
---

# Phase 3 — Approve hands off and commits ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** an approved pass produces a commit — through the project's own commit
skill where there is one, and honestly by hand where there is not.

## Tasks

- [x] Add `review.commitWith` to `env.config.json` (default `"/commit"`), through
      the existing config merge, the `.example` file and `env.config.md`. A
      project setting `"none"` records the verdict and commits nothing.
- [x] Extend the guard that asserts the example ships no key the engine ignores —
      the trap `feat-phase-review` found, where a stale example key is silently
      dropped by the known-keys merge.
- [x] Add the approve branch to `/spec-diff`: on an honoured `approve`, invoke the
      configured skill. **Never vendor it** — say plainly that `/commit` belongs to
      skittership and this is a hand-off (Decision 4).
- [x] Write the fallback: with no such skill available, stage the task's files,
      run the project's typecheck and test commands, write a conventional commit
      — and **say which path was taken**, every time. A commit made under rules
      nobody configured must never look like one made under `/commit`.
- [x] Decide availability from **the skill list already in context**, never by
      testing for a file. Say so in the skill body with the reason, so a later
      edit does not "improve" it into a path check
      (`.claude/rules/negative-checks.md` rule 1).
- [x] Let the commit's own failure be the answer: if typecheck or tests fail, the
      commit does not happen and the verdict is not logged as committed.
      **An approval judges the change, never promises that it builds.**
- [x] Append the outcome (`approve`, the commit sha, which path) to the decisions
      log, then re-render so the page shows it.
- [x] Tests: the configured skill is named in the hand-off; `"none"` records and
      does not commit; the fallback path is described and says so; the example-key
      guard covers the new key; a red suite leaves no commit and no logged
      outcome.
- [x] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

This is the phase that **writes to git on someone's behalf**, so it is the one
that must be loudest about what it did and under which rules. The commit is local
and nothing is pushed.
