---
github_identifier: "#113"
github_url: "https://github.com/SkitterByte/skitterspec/issues/113"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# Rolling base — follow the newest release-candidate branch

> **Type:** Feature
> **Name:** feat-rolling-base (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-11-07)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-11-06
> **Area:** packages/common/src/env (resolve.js, config.js, integrate.js, provision.js, mainguard.js, cli.js), packages/common/assets/core/env.config.md, packages/common/assets/skills (spec-start, spec-complete, spec-to-main), docs/reference.html
> **Stack:** worktree
> **Docs:** reference
> **Origin:** follow-up from `feat-pr-landing` (#106) — LSC's rc-flow
> **Next spec:** [`feat-hotfix-to-master`](../../backlog/feat-hotfix-to-master/00-overview.md) (#118) — its carry-back targets the base this spec resolves

## Problem

LSC works off a release-candidate branch cut from `master`, and the rc is
**versioned per release** (`2026/Q4`, then `2026/Q1` …). `baseBranch` is a
literal name today (`resolveBaseBranch`, `env/resolve.js`), so every release
roll would need someone to edit and commit `env.config.json` and tell every dev
— and a dev who missed it forks from and lands onto a dead rc that nobody will
ever merge. The team lead cutting the new rc is already the decision; nothing
else should be needed for skitterspec to follow it.

## Decisions

1. **Cutting the branch is the announcement.** Config carries a pattern
   (`baseBranchPattern`, e.g. `"20??/Q?"`), committed once. The base resolves to
   the **newest match by commit date**. No per-cycle edit, no message to the
   team. Rejected: a verb that edits and commits config every cycle (a commit to
   main per release, and devs still have to pull it); a pointer ref the lead
   moves (one more step to forget); reading the tracker's iteration (provider-only,
   needs a name mapping per provider).
2. **Safe for LSC's flow specifically because the next rc is cut only after the
   release merge** — so the newest match is the live one. An explicit
   `baseBranch` still wins over the pattern, as the pin for any team whose rcs
   overlap.
3. **Resolution reads local remote-tracking refs, never the network.**
   `resolveBaseBranch` is called everywhere (the main-guard hook included), so it
   stays synchronous and offline. The **fetch** happens at the points that
   already talk to the remote: `spec-env up`, `integrate`, and the new
   `spec-env base`.
4. **No match is a refusal, never a fallback.** Zero refs matching the pattern
   most likely means *not fetched*, not *no rc exists*; falling through to
   `origin/HEAD` → `main` would land work on `master`, which LSC forbids. It
   says so and names `spec-env base` (which fetches). (`negative-checks.md` rule 4.)
5. **Bare `spec-env base` lists; it never edits.** Fetch, list pattern matches
   newest-first with their commit dates, mark the resolved one, and show which
   in-flight specs forked from an older match. Pinning stays a hand edit of
   `baseBranch` — it is the exception, so it does not get a verb.
6. **A spec that outlived a roll lands on the new rc, loudly.** `integrate`
   fetches, and where the spec forked from an older match the plan prints
   `forked from 2026/Q4 · landing onto 2026/Q1`. The rebase is safe because the
   new rc was cut from master after the old one merged. The push consent ask
   already names the base (`feat-pr-landing` phase 4) — that is the human catch.
7. **The primary checkout must be on the resolved base for an `ff` land.**
   `merge --ff-only` moves whatever is checked out, so a primary checkout still
   on the old rc would receive the land. The plan detects it and prints the
   `git switch` first; a dirty primary checkout refuses.

## Solution overview

`baseBranchPattern` (glob over branch names) → `resolveBaseBranch` gains a step
between the explicit pin and `origin/HEAD`: list `refs/remotes/<remote>/*`
matching the pattern, sort by `committerdate`, take the newest; none → a
structured refusal. `spec-env base` is the fetch-and-list surface. `up` and
`integrate` fetch first, then resolve, so they always see the newest rc; every
other caller reads what the last fetch saw. Fork point, the land plan, the
main-guard and live overlay all go through the one resolver, unchanged.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `baseBranchPattern` (env.config.json) |
| Business rule | update | `resolveBaseBranch`: pin → pattern (newest by date) → origin/HEAD → main/master; pattern with no match refuses |
| CLI command | add | `spec-env base` — fetch, list matches, mark resolved, list stale in-flight specs |
| CLI command | update | `spec-env up` / `integrate` fetch before resolving; integrate prints forked-from vs landing-onto; ff plan switches the primary checkout |
| Skill/rule | update | spec-start, spec-complete, spec-to-main relay the retarget line |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `baseBranchPattern` + resolver (newest match, refusal on none) | ✅ | [01-pattern-resolver.md](01-pattern-resolver.md) |
| 2 | `spec-env base` — fetch and list | ✅ | [02-base-verb.md](02-base-verb.md) |
| 3 | Fetch-before-resolve in up/integrate; retarget line; primary-checkout switch | ✅ | [03-retarget-at-land.md](03-retarget-at-land.md) |
| 4 | Skills, env.config.md, reference docs | ⬜ | [04-skills-and-docs.md](04-skills-and-docs.md) |

## Open questions

- None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-11-06 | Ready | backlog | Reuben Greaves |
| 2026-11-07 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-11-06 — Spec created from the `feat-pr-landing` follow-up. Supersedes
  that spec's recorded shape ("bare `spec-env base` lists, the pick edits
  config"): grilled to *cutting the branch announces it* — the pattern resolves
  the base, and no one edits config per release.
- 2026-11-07 — Phase 1: the no-match refusal is a thrown
  `BaseUnresolvedError` (`.refused` carries the line) rather than a returned
  object. `resolveBaseBranch` has ~15 string-expecting callers, and a throw
  reaches the CLI's exit-1 path and the main-guard's fail-open `catch` with no
  caller edited. Also found: git's ref glob does not cross `/` (`rc/*` misses
  `rc/a/b`) — added to phase 4's `env.config.md` task.
- 2026-11-07 — Phase 2: the verb list in `env.config.md` and
  `spec-planning.md`, and a `docs/reference.html` row, landed here rather than
  in phase 4 — the asset-prose and docs-claims tests fail on a dispatched verb
  no page names. Phase 4 still owns the full write-up and the `verified:` bump.
  "Forked from" is the match with the newest merge-base; a tie (an rc cut from a
  base already holding the old rc's tip) goes to the newer match, so such a spec
  is not listed as behind. Stale rows print only when the pattern chose the base.
- 2026-11-07 — Phase 3: `spec-env up` forked from whatever the primary
  checkout had out, so a checkout left on the old rc would fork every new spec
  from it. Added a task: fork from the resolved base explicitly, and refuse when
  the planned spec commit would land on the old rc instead. The retarget line is
  printed in the ff, checkout and PR plans; `integrate` has no `--json`, so there
  was none to add it to. A primary checkout on an older match is recognised by a
  positive signal (its branch matches the pattern); anything else keeps the
  existing live-session refusals.
