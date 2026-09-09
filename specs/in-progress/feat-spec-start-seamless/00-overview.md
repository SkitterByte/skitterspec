---
linear_identifier: "SKS-97"
linear_url: "https://linear.app/skitterbyte/issue/SKS-97/spec-start-commits-the-spec-it-is-starting"
---

# /spec-start completes in one invocation

> **Type:** Feature
> **Name:** feat-spec-start-seamless (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-09)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-09
> **Area:** packages/common/src/env/{provision.js,resolve.js,config.js}, packages/common/src/cli.js, packages/common/assets/skills/spec-start/SKILL.md, packages/common/assets/core/env.config.*, packages/common/test
> **Stack:** worktree

## Problem

Authoring a spec and starting it is the commonest sequence there is, and it
blocks: `/spec` leaves the spec uncommitted, then `/spec-start`'s gate refuses the
dirty tree and the operator has to run `/commit` by hand in between. Hit while
starting `feat-release-gating`.

The engine's behaviour underneath is worse than the refusal suggests. The
`clean`/`onBase` gate exists **only in `planCheckoutUp`**
(`src/env/provision.js:199`); worktree-mode `planUp` has no clean gate at all. So
`spec-env up` provisions a worktree forked from committed base — **without the
spec in it** — and the refusal arrives later at `/spec-live take`
(`src/env/live.js:187`) as a generic "commit or stash them first". The operator
ends up with a worktree missing the spec it is for, and a message naming the
wrong stage. The same end state is reachable from a perfectly clean tree, when
the spec was only ever committed on some other branch.

**The hand-off splits it again, and for a mechanism that should not be there.**
In `worktree` mode step 3.2 tells the operator to type `/spec-live <name>` — a
*testing* command — and then **re-run `/spec-start`**, because the housekeeping
lives in step 4, after it. Two invocations with a typed command between them, and
the gap leaves an inconsistent state: worktree and branch exist while the spec
still reads `Ready` in `specs/backlog/` with no Developer.

The deeper fault is that the move happens at all. `675bf54` ("pivot to the
one-workbench model") reused `spec-env live take` to mean "in flight" as well as
"live for testing" — the same git move, two jobs, one name. The engine still
prints `Test at your canonical URL` on success, and `spec-planning.md` still
describes the overlay as *"the light way to test a spec"*. So `/spec-start`
provisions a worktree — deps, `.env`, generated clients — then immediately
detaches it and works in the primary checkout instead. That makes `worktree` mode
build where `checkout` mode builds, which is the one thing the `mode` key exists
to distinguish.

## Decisions

1. **Membership in an exactly-known set, not a judgement about importance.** The
   gate keeps refusing dirty trees; it just stops treating "the spec being started"
   as unknown dirt. If **every** uncommitted path belongs to the target spec,
   commit it and carry on; if a single path falls outside, refuse with today's
   words. This does not weaken the rule the gate exists for — moving *another*
   spec's unfinished work is still never ours to do.
2. **The engine classifies, the skill relays.** A pure preflight in the planner,
   not prose in `SKILL.md`. A safety check written as prose is the failure mode
   `feat-release-gating` exists to fix; and a second copy of the gate in the skill
   is a copy that drifts.
3. **The commit is a planned step, not a silent write.** `spec-env up` is already
   a planner whose printed commands the skill runs, so the commit becomes its
   first printed command. Seamless — no operator turn — while keeping "never commit
   on the operator's behalf" honest: the write is visible in the plan before it
   happens.
4. **Worktree mode gains the gate it never had.** Today only checkout mode checks
   `clean`. Both planners take the same preflight, so the failure is caught at
   provisioning with a precise reason instead of surfacing three steps later as a
   live-overlay refusal.
5. **"Belongs to the spec" is provider-neutral and configurable.** The spec's own
   folder under any bucket is always owned. Anything else — a tracker's per-spec
   snapshot, say — is declared by a new `spec.companionPaths` list in
   `env.config.json`, with `{slug}` / `{identifier}` tokens resolved the way
   `branch.pattern` already resolves them (`branch.identifierField`,
   `src/env/resolve.js:138`). The base cannot hardcode
   `specs/.core/linear-base/…`: that path is Linear's (`sync.baseDir`,
   `packages/linear/src/config.js:159`) and the base engine is tracker-free.
6. **An unresolvable companion pattern contributes nothing.** When a pattern uses
   `{identifier}` and no identifier resolves (no `identifierField` configured, or
   absent on the spec), the pattern matches no path — so those files stay foreign
   and the gate refuses. Per `.claude/rules/negative-checks.md` §4, the case we
   cannot classify routes to the harmless branch, not to a commit.
7. **Assert the spec is present in the base branch's tree**
   (`git cat-file -e <base>:<specPath>/00-overview.md`) before forking. A positive
   signal, per §1 — it catches both ways of forking a worktree that lacks its own
   spec, including the clean-tree case a dirty check can never see. When it fails,
   name the branch that does have the spec rather than reporting a bare absence.
8. **Checkout mode commits rather than refuses, too.** Its refusal exists because
   `git switch -c` silently carries uncommitted work onto the new branch; once the
   spec is committed first there is nothing left to carry, so the two modes get the
   same treatment rather than diverging.
9. **In `worktree` mode a spec is built in its worktree.** `/spec-start` stops
   moving the branch into the primary checkout, so it never calls the live overlay
   and never asks for a typed command. `main` stays free and several specs run at
   once — the behaviour `spec-init` and `spec-planning.md` already describe, and the
   reason the `mode` key exists. Anyone who wants the one-workbench flow already has
   it: that is `checkout` mode.
10. **`/spec-live` goes back to one job — testing.** It reuses the running dev
   server to put a spec at the canonical URL, which is what its docs, its
   `argument-hint` and the engine's own success message all say. It keeps
   `disable-model-invocation`; no lifecycle skill calls it.
11. **The park path becomes the only path.** Today `/spec-start` branches on
   whether the live overlay would refuse — hotfix, `Stack: worktree + docker`,
   migrations. With no live call there is nothing to refuse, so that branch is
   deleted and hotfixes stop being a special case here. One path, and it is the one
   already proven by the specs that take it today.
12. **Housekeeping runs in the worktree, before the hand-off.** Bucket move, header,
   State log and commit via `git -C <worktreePath>`, so no path can end with a
   provisioned worktree and a `Ready` spec.
13. **`/spec-next` keeps its resolution rules, so the session hand-off stands.**
   It builds only the spec it is standing in — the live spec of this checkout, the
   worktree its cwd is inside, or the branch in `checkout` mode — and a name
   argument narrows a re-run rather than selecting a spec elsewhere. That refusal
   exists to stop the wrong branch being built, and is not worth loosening. So in
   `worktree` mode `/spec-start` ends at the opened session and phase 1 is built
   there; only `checkout` mode flows straight on into phase 1 in the same session.
   "One invocation" means no re-run and nothing typed in between — not that the
   work lands in the session you started from.
14. **The gate relaxes in `worktree` mode, and only there.** "Nothing else in
   flight" was a consequence of the one-workbench model; once specs build in their
   own worktrees, starting one while another is live or parked is exactly the
   parallelism the mode is for. The tree must still be **clean** — the commit in
   phases 1–3 depends on it. `checkout` mode keeps the full gate: it holds one spec
   by construction.

## Solution overview

- **`classifyDirtyTree(spec, dirtyPaths, config)`** — pure, in
  `src/env/provision.js` (or a sibling). Returns
  `{ owned: string[], foreign: string[] }`. Owned = the spec's folder under any
  bucket, plus each resolved `spec.companionPaths` entry.

- **New config key**, defaulting to `[]` so base behaviour is unchanged:

  ```jsonc
  "spec": {
    // Paths that belong to a spec alongside its own folder — a tracker
    // provider's per-spec snapshot, for instance. `{slug}` and `{identifier}`
    // expand; a pattern whose `{identifier}` cannot be resolved matches nothing.
    "companionPaths": ["specs/.core/linear-base/{identifier}.base.json"]
  }
  ```

- **Both planners** take `ctx.dirtyPaths` and `ctx.specOnBase`, and resolve to one
  of three outcomes:

  | Tree | Spec in base tree | Outcome |
  |------|-------------------|---------|
  | clean | yes | provision, exactly as today |
  | all dirt owned | either | plan `git add` + `git commit`, then provision |
  | any foreign dirt | — | blocked, today's words, naming the foreign paths |
  | clean | no | blocked, naming the branch that has the spec |

- **Printed plan** — the commit leads:

  ```
  $ skitterspec spec-env up feat-x
  uncommitted, and all of it belongs to feat-x:
    specs/backlog/feat-x/
    specs/.core/linear-base/SKS-92.base.json

  to provision, run:
    git add specs/backlog/feat-x specs/.core/linear-base/SKS-92.base.json
    git commit -m "chore(spec): add feat-x"
    git worktree add …
  ```

  The subject is `add` when the spec folder is wholly untracked and `update`
  otherwise. No `Refs:` trailer is composed here — the trailer is a provider
  concern, and `.claude/rules/commit-trailers.md` is explicit that a fabricated
  ref is worse than an honest gap.

- **One invocation, end to end** — what `/spec-start <name>` does after this spec:

  ```
  worktree mode                     checkout mode
    gate: clean tree                  gate: clean, on base, nothing in flight
    → spec-env up                     → spec-env up
        provision + commit the spec       commit the spec, git switch -c
    → housekeep in the worktree       → housekeep here
        git -C: move, header, log         move, header, State log, commit
    → open.command                    → /spec-next  (build phase 1 here)
    → /spec-next in that session
  ```

  Nothing typed in between, and no state in which the worktree exists but the spec
  says `Ready`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `spec.companionPaths` in `env.config.json` (default `[]`) |
| Engine | add | `classifyDirtyTree(spec, dirtyPaths, config)` |
| Engine | update | `planUp` (gains a clean gate), `planCheckoutUp` (commits instead of refusing) |
| CLI command | update | `spec-env up` — supplies `dirtyPaths`/`specOnBase`, prints the commit step |
| Skill | update | `/spec-start` — gate relays three outcomes; builds in the worktree; housekeeps first |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Classify a dirty tree against one spec | ✅ | [01-classify.md](01-classify.md) |
| 2 | Both planners commit, gate and assert | ✅ | [02-planners.md](02-planners.md) |
| 3 | CLI and `/spec-start` wiring | ⬜ | [03-cli-and-skill.md](03-cli-and-skill.md) |
| 4 | Build in the worktree, housekeep first | ⬜ | [04-handoff.md](04-handoff.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-09 | Ready | backlog | Reuben Greaves |
| 2026-09-09 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-09 — Spec created after `/spec-start feat-release-gating` blocked on the uncommitted spec.
- 2026-09-09 — Widened from the commit gate to the whole invocation, after a run
  in `~/code/ereqs` provisioned a worktree and then asked for `/spec-live` plus a
  re-run to finish the housekeeping. Renamed `feat-spec-start-autocommit` →
  `feat-spec-start-seamless`; added phase 4.
- 2026-09-09 — Phase 2 built. Both planners share one `planSpecCommit`; the
  on-base refusal had to move **after** the commit decision, since a spec is
  off-base precisely because it is uncommitted.
- 2026-09-09 — Phase 1 built. `classifyDirtyTree` went into its own
  `src/env/classify.js`; `readFrontmatterField` is now exported from
  `resolve.js`; ownership spans all four buckets because a spec mid-move is
  dirty in two of them at once.
- 2026-09-09 — Started; confirmed while provisioning that `/spec-next` cannot be
  reached from the primary checkout, so the worktree session hand-off is a stated
  constraint rather than a gap to close (decision 13).
- 2026-09-09 — Phase 4 reversed after review: `/spec-start` will **not** call
  `spec-env live take` at all. The overlay is a testing tool that `675bf54`
  quietly gave a second job; automating it would have entrenched the collision.
  Worktree mode builds in its worktree instead, restoring what the `mode` key
  means and making the existing `spec-init` / `spec-planning.md` wording true again.
