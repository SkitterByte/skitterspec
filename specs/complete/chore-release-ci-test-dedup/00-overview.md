---
github_identifier: "#307"
github_url: "https://github.com/SkitterByte/skitterspec/issues/307"
---

# Release CI test dedup

> **Type:** Chore
> **Name:** chore-release-ci-test-dedup (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/307
> **Author:** Reuben Greaves
> **Raised:** 2026-11-24
> **Area:** .github/workflows/ci.yml, .github/workflows/release.yml, scripts/windows-gate.cjs (new), scripts/workflows.test.js, RELEASING.md
> **Stack:** worktree
> **Docs:** none: repo-internal CI, no docs page covers `.github/workflows`

## Summary

A release runs the Windows suite once rather than once per tag, and tag pushes
stop re-running the whole CI matrix beside the release workflow.

## Problem

A five-package batch release runs the full suite about 50 times across 28 CI
jobs over the same code. `ci.yml`'s bare `on: push` fires on every tag, so each
tag runs the Ubuntu matrix and Windows alongside `release.yml`, which runs its
own Windows suite (5–10 min) and an Ubuntu `pnpm test`. The tagged commits differ
from each other, and from main's head, only by a version line and a
`RELEASES-*.md` file.

## Acceptance criteria

- Pushing a release tag starts `release.yml` only; `ci.yml` does not run.
- In a batch, after main's CI Windows job goes green, every tag's stage proceeds
  without running the Windows suite again, and its log names the run it adopted.
- A tag whose tree differs from every earlier run beyond version + notes runs the
  Windows suite itself, exactly as today.
- A red, cancelled or timed-out adopted run, or any error in the lookup, falls
  back to running the Windows suite. It never skips it.
- Each tag's stage job still runs `pnpm test` on Ubuntu.

## Decisions

1. **`ci.yml` triggers on `push: branches: ['**']`**, which excludes tags.
   `release.yml` already gates a tag on Windows and Ubuntu, so CI on a tag is
   pure duplication (15 jobs per 5-tag batch).
2. **Reuse an earlier Windows result instead of re-running it.** An ubuntu
   `windows-gate` job decides; the `windows` job runs only when the gate says so,
   and `stage` needs both. Rejected: a check as the first step on the Windows
   runner, because it still pays the Windows spin-up and keeps the job graph
   lying about what ran.
3. **Wait and adopt.** The gate looks at `ci.yml` and `release.yml` runs created
   *before* this one whose commit is equivalent (Decision 4). It waits up to
   30 min for that run's Windows job and adopts a `success`. Main's CI push lands
   before the tags, so it is normally the one adopted, and one Windows run covers
   the whole batch. Rejected: completed runs only, since the batch runs overlap
   and would mostly still test Windows themselves. Rejected: a `concurrency`
   group, because GitHub keeps only one pending run and cancels the rest.
4. **Equivalent means version + notes only.** `git diff` between the candidate
   commit and HEAD may touch only `RELEASES-*.md`, plus `packages/*/package.json`
   where the sole changed line is `"version"`. That is a positive signal
   (`.claude/rules/negative-checks.md` rule 1). Version-sensitive tests
   (`migration-guide.test.js`) are not Windows-specific and still run per tag in
   the stage job's Ubuntu `pnpm test`.
5. **Every cannot-tell runs the suite** (rule 4): an API error, a shallow
   history, a missing commit, a non-success conclusion, a timeout. The gate never
   fails the workflow itself; it only answers `run` or `skip`.
6. **The decision logic is a pure function** in `scripts/windows-gate.cjs`, fed
   runs and diffs by a thin CLI, so it is unit-tested without the API. The gate
   job gets `actions: read` and nothing else; no OIDC token.

## Solution overview

```
release.yml (tag)
  windows-gate (ubuntu, fetch-depth 0, actions: read)
    → node scripts/windows-gate.cjs   → output run=true|false, adopted=<run url>
  windows   needs gate, if run == 'true'          (unchanged suite)
  stage     needs [windows-gate, windows],
            if: !cancelled() && gate succeeded &&
                (windows succeeded || (windows skipped && run == 'false'))
```

The gate prints why it decided: the adopted run's URL and its diff, or the
reason it could not tell.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CI workflow | update | ci.yml `on.push.branches: ['**']` (tags excluded) |
| CI workflow | update | release.yml: + `windows-gate` job, `windows` conditional, `stage` needs both |
| Script | add | scripts/windows-gate.cjs (`decide()`, `equivalent()`, CLI) |
| Docs | update | RELEASING.md Windows section, release.yml header |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Stop `ci.yml` running on tags | ✅ | [01-ci-skip-tags.md](01-ci-skip-tags.md) |
| 2 | Windows gate adopts an equivalent green run | ✅ | [02-windows-gate.md](02-windows-gate.md) |

## Open questions

- [ ] None

## Changelog

- 2026-11-24 — Spec created.
- 2026-11-24 — Phase 2: the Windows job runs on `run != 'false'` rather than `== 'true'`, so a gate that fails outright still runs the suite. Added a test that the gate's job name matches both workflows.
- 2026-11-24 — Completed; all phases done, tests green.
