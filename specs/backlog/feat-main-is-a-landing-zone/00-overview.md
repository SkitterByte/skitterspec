---
linear_identifier: "SKS-339"
linear_url: "https://linear.app/skitterbyte/issue/SKS-339/main-is-a-landing-zone-not-a-workspace"
---

# main is a landing zone, not a workspace

> **Type:** Feature
> **Name:** feat-main-is-a-landing-zone (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-17
> **Area:** `packages/common/src/env/{provision,review,resolve,teardown,hooks,cli}.js`, `packages/common/assets/skills/{spec,no-spec}/`, `packages/common/assets/commands/`, `packages/common/assets/hooks/`, `packages/common/assets/rules/spec-planning.md`
> **Stack:** worktree

## Problem

Work reaches `main` by two routes and both cost something. **Ad-hoc work** — "just
bump my other projects to the new version" — is done in the primary checkout
because nothing stops it: it leaves `main` dirty, forces every in-flight spec to
replay over it, and bypasses the review gate entirely, since no page is ever
rendered for it.

**Spec authoring** is the worse of the two, and it is skitterspec's own doing.
`/spec` Phase C2 renders the spec's documents and then *waits* for a verdict —
deliberately without a timeout, because a reader walking away from a diff is the
normal case. `--docs` is documented as never wanting a worktree, so all of it
happens in the primary checkout on `main`. The review mechanism that makes a spec
good is exactly what stretches the dirty window on `main` from seconds to hours,
and a release cannot be cut through it.

Both are the same missing rule: **nothing should write to `main` at all.** It is
where work lands, not where work happens.

## Decisions

1. **The spec is authored in its own worktree, and landed by the verdict.**
   `/spec` provisions after grilling and before writing — grilling puts nothing on
   disk and the slug is known by the time it ends, so there is no chicken-and-egg.
   The committing verdict commits on the branch and then rebases + fast-forwards
   `main`. Rejected: committing the spec the moment it is written, which puts an
   ungrilled spec on `main` before anyone has judged it — the thing Phase C2
   exists to prevent.

2. **Not "author it in a worktree and leave it there."** The backlog living on
   `main` is load-bearing: `ls specs/backlog/` is how specs are found, and
   `spec-planning.md` already concedes the buckets are only true on the branch you
   stand on. Landing on the verdict keeps that property while `main` is never
   dirty.

3. **Phase C2's "arm nothing" survives, with a better reason.** Today walking away
   leaves `main` dirty, which is everyone's problem. Under this it leaves an
   unlanded branch in a worktree, which is nobody's. The decision stops being a
   concession to the mess it creates.

4. **Docs-mode provisioning skips `setup` and docker.** Running
   `pnpm install --frozen-lockfile` to write a markdown file is absurd.
   `planUp` already returns `setupCommands`; docs mode returns it empty and the
   commands run at `/spec-start`, where the worktree is first used for code.

5. **Worktree lifetime follows the verdict.** `commit-start` keeps it — you are
   carrying straight on, and `/spec-start` reuses it (and runs the setup docs mode
   skipped). Plain `commit` lands and tears it down: a spec parked in the backlog
   holds no resources. Rejected: always-keep (five backlog specs is five
   `node_modules`) and always-teardown (`commit-start` would re-provision seconds
   after tearing one down).

6. **`/no-spec` is a skill, not `spec --quick`.** Mechanical work genuinely has no
   spec, and pretending otherwise produces a one-phase document nobody reads.
   Rejected: a minimal chore spec — it is the thing the name says there is none of.

7. **A `/no-spec` branch is a registry entry with no spec document.** The registry
   is already keyed by a bare name string, so `spec-env status`, `integrate` and
   teardown keep working. The cost is honest: every consumer that assumes
   name → spec folder gains a cannot-tell branch, per
   `.claude/rules/negative-checks.md`. Rejected: a plain git branch with no
   registry — it would be invisible to every `spec-env` verb, so teardown, status
   and the review page would all be hand-rolled or absent.

8. **`/no-spec` arms the gate; `/spec` does not.** Finished code owes a verdict; a
   written spec owes no phase. That asymmetry is already the rule in
   `spec-reports.md` and falls out rather than being invented here.

9. **A new `nospec` button set, with `commit-land`.** Reusing `refresh`
   (`commit`/`changes`/`discuss`) would make plain `commit` mean "commit, land and
   tear down" on one page and "just commit" on another — the exact ambiguity
   `review.js` rejects a shared verdict word for. `commit-land` names its action;
   `commit` beside it means "committed, not finished", leaving the branch standing.

10. **The guard refuses the first write, not the commit.** `PreToolUse` on
    `Edit|Write|NotebookEdit`: nothing has been written yet, so the fix is free —
    type `/no-spec`. A commit-time gate fires once the work exists, and in worktree
    mode moving it is the genuinely annoying part, since the primary checkout
    cannot `switch -c` out from under the other worktrees. Rejected: both, which
    doubles the fail-open surface to catch `sed -i`, a case nobody hits.

11. **The guard fires only on a positive signal.** Isolation configured **and**
    this dir is the primary checkout **and** `HEAD` is the base branch.
    `resolve.js`'s `{ onBase, branch, baseBranch }` already answers structurally
    rather than throwing. Everything else — no repo, no config, a worktree, an
    unresolvable base, a missing or crashed engine, a timeout — allows the write
    in silence.

12. **`/allow-main` is a user-only command, and that is the whole guard.** Marked
    `disable-model-invocation`, like `/spec-remote-review`: **Claude cannot unblock
    itself.** A guard the model can lift is decoration. It is session-scoped via
    `CLAUDE_CODE_SESSION_ID` (which the hook payload also carries as `session_id`),
    with a recorded reason; where no session id exists it degrades to a repo-wide
    toggle that `/allow-main off` clears, and `spec-env main status` says which
    kind is active.

13. **On by default wherever isolation is configured**, matching the review gate's
    precedent, under `guards.mainIsLandingZone`. This does change behaviour for
    existing projects on upgrade, which is the honest cost — mitigated by the
    refusal naming both exits (`/no-spec` and `/allow-main`) and the config key.

14. **`/spec-init` is unaffected and needs no allowlist entry.** It bootstraps a
    repo that has no `env.config.json` yet, so isolation is off and the guard
    fails open by construction. That leaves the allowlist genuinely empty: with
    `/spec` authoring into a worktree and `/no-spec` catching ad-hoc work, `main`
    has no legitimate writer left, and the guard is one sentence rather than a
    policy with exceptions.

## Solution overview

```
/spec      grill ──▶ spec-env up --docs ──▶ write in worktree ──▶ render ──▶ wait
                                                                              │
                               commit-start ◀──────────────────────────────────┤
                                  │  /commit on branch                        │
                                  │  spec-env integrate  (rebase + ff main)   │
                                  │  keep worktree ──▶ /spec-start            │
                                                                              │
                               commit ◀─────────────────────────────────────────┘
                                     /commit, integrate, teardown

/no-spec   spec-env up --docs ──▶ work ──▶ render + arm ──▶ wait
                               commit-land: /commit, integrate, teardown
                               commit:      /commit, branch stands

main       guarded: Edit|Write|NotebookEdit refused in the primary checkout
                    on the base branch.  /allow-main lifts it, user-only.
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-env up --docs` |
| CLI command | add | `spec-env main <check\|allow\|status>` |
| Skill | add | `/no-spec` |
| Skill | update | `/spec` — Phase B provisions, C2 renders from the worktree, verdicts land |
| Command | add | `/allow-main` (`disable-model-invocation`) |
| Hook | add | `assets/hooks/main-guard.cjs`, matcher `Edit\|Write\|NotebookEdit` |
| Config key | add | `guards.mainIsLandingZone` (default `true` with isolation) |
| Engine | update | `provision.js` — docs mode: no `setup`, no docker |
| Engine | update | `review.js` — `nospec` button set, `commit-land` verdict |
| Engine | update | `hooks.js` — register N hooks, not one |
| Engine | update | `resolve.js`, `teardown.js` — tolerate a registry name with no spec folder |
| Skill/rule | update | `spec-planning.md` — the skill table, and "author backlog specs from the base branch" |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Docs-mode provisioning — `spec-env up --docs` | ⬜ | [01-docs-mode-provisioning.md](01-docs-mode-provisioning.md) |
| 2 | `/spec` authors in its worktree and lands on the verdict | ⬜ | [02-spec-authors-in-worktree.md](02-spec-authors-in-worktree.md) |
| 3 | `/no-spec` — the lane for work with no spec | ⬜ | [03-no-spec.md](03-no-spec.md) |
| 4 | The main guard — hook, engine verb, `/allow-main` | ⬜ | [04-main-guard.md](04-main-guard.md) |

**Phase order is a safety property, not a preference.** The guard is a wall until
`/no-spec` exists to be pushed toward, so it ships last. Phase 1 is engine-only
and independently shippable; phase 2 must carry the land hop with it, because
authoring into a worktree *without* landing would leave the spec on an unlanded
branch — strictly worse than today.

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-17 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-17 — Spec created.
