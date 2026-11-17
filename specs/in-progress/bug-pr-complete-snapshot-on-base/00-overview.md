---
github_identifier: "#216"
github_url: "https://github.com/SkitterByte/skitterspec/issues/216"
---

# Bug: PR-mode completion leaves the tracker snapshot dirty on the base branch

> **Type:** Bug
> **Name:** bug-pr-complete-snapshot-on-base
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/216
> **Author:** Reuben Greaves
> **Raised:** 2026-11-17
> **Area:** `packages/provider-kit/src/apply.js`, `packages/{github,azure-boards,linear,jira}/src/cli-sync.js`, `packages/{github,azure-boards,linear,jira}/assets/seams/spec-tracker-sync.md`, `packages/common/assets/skills/spec-complete/SKILL.md`
> **Docs:** github, azure-boards, linear, jira

## Summary

Completing a linked spec in PR mode no longer leaves a modified tracker
snapshot on the base branch. Run 1 commits the snapshot the merge will need,
and run 2 moves the ticket to Done without touching it.

## Symptom

Reported against `@skitterbyte/skitterspec-azure-boards` 2.12.0, with
`land.strategy: "pr"`, `land.specDocs` unset under a provider (so `"branch"`),
and `workflowState: "pull"`:

> PR-mode completion leaves the tracker snapshot uncommitted on the base branch.

1. `/spec-complete` run 1 commits the `in-progress → complete` move on the spec
   branch to ride the PR, and skips the tracker push ("a ready PR is not a
   merged one").
2. The host merges the PR.
3. `/spec-complete` run 2 fast-forwards the primary checkout and runs the
   deferred `/spec-push`. `git status` then shows
   ` M specs/.core/azure-base/<id>.base.json` on the base branch.

> Where the base branch takes changes only through PRs, the operator's choices
> are to discard it (so `/spec-status` later reports a stale snapshot) or to
> carry it into an unrelated PR.

The same `§6-pr` and sync seam ship with every provider, so GitHub, Linear and
Jira are affected too.

## Root cause

The sync seam's "Why it sits here" pins the push **after the `git mv` and before
the commit**, so that the snapshot lands in the completion commit. PR mode then
moves the push to run 2 (`spec-tracker-sync.md`, "In `/spec-complete`'s PR mode
this push belongs to run 2"). In the `branch` lane the commit it was meant to
precede has already happened, in run 1. Run 2's `applySpecPlan` therefore
ends at `recordPush` (`packages/provider-kit/src/apply.js` step 7), rewriting
the snapshot in the primary checkout on base with no spec branch left to commit
to. The trunk lane is not affected, because there run 2 does the move, the push
and the commit together.

## Failing test (red)

`packages/provider-kit/test/apply-held-state.test.js` simulates run 1
(`holdState`) and run 2 (`sendHeld`) against a fake tracker. It asserts that run
1 sends no state, that run 2 sends `complete`, and that the snapshot bytes run 1
recorded are unchanged after run 2.

```
cd packages/provider-kit && node --test test/apply-held-state.test.js
✖ run 1 holds the Done and records it; run 2 sends it and leaves the snapshot alone
  AssertionError [ERR_ASSERTION]: run 1 sent a state before the merge: [{"state":"complete"}]
```

## Decisions

1. **Hold the state in run 1, send it in run 2 (the reporter's direction (a),
   made workable).** Run 1 applies the plan **minus the spec issue's state**, then
   records the snapshot as though it had been sent. That
   snapshot is swept into the move commit and rides the PR. Run 2 sends exactly
   the held state. Its recorded snapshot is byte-identical, so base stays
   clean. *Rejected:* a plain `record` in run 1. The snapshot means "what the
   tracker was last sent", so run 2's plan would be empty and the item would
   never reach Done. Also rejected: run 2 skipping the record, which leaves a
   permanent phantom "would push" in `/spec-status`. And report-only, which
   leaves the dirty file in place.
2. **Content goes in run 1, the transition in run 2.** Description and phase
   updates are not status, so the tracker can show them before the merge. Only
   the Done is what "a ready PR is not a merged one" holds back. The assignee is
   not held. Sending a held clear in run 2 would mean guessing whether the repo
   ever pushed one, and under `push` the release at PR-ready is harmless.
3. **`sendHeld` with a non-empty plan falls back to a full apply, and says so.**
   A run 1 from before this fix recorded nothing, so the plan still carries the
   whole completion. Sending only the state would strand the description, so
   that case keeps today's behaviour. The report then names the snapshot file
   left modified on base, which is the reporter's direction (c) as the
   cannot-tell branch.
4. **The held state is a real transition, not a resend.** Under `pull` it goes
   through the same path as any bucket move, so the tracker's resend guard is
   not involved.
5. **Trunk lane unchanged.** Run 2 already pushes between the move and the
   commit there.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Service | update | `applySpecPlan({ holdState, sendHeld })` in provider-kit |
| CLI command | update | `spec-sync apply <spec> --hold-state` · `--send-held` (github, azure-boards, linear, jira) |
| Skill/rule | update | `spec-complete` §6-pr run 1 step 4 and run 2; `spec-tracker-sync` seam × 4 |

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Engine: hold and send the completion state | ✅ | [01-engine-held-state.md](01-engine-held-state.md) |
| 2 | Provider CLIs: `--hold-state` / `--send-held` | ✅ | [02-provider-flags.md](02-provider-flags.md) |
| 3 | Skill, seams and docs | ⬜ | [03-skill-seams-docs.md](03-skill-seams-docs.md) |

## Open questions

- None

## Changelog

- 2026-11-17 — Bug reproduced; failing test added (red). Fix shape chosen:
  hold the state in run 1 and send it in run 2 (Decision 1).
- 2026-11-17 — Phase 1 fixed: `applySpecPlan` takes `holdState` / `sendHeld`;
  red test green, 5077 + all package suites pass. Assignee not held (Decision 2
  narrowed).
- 2026-11-17 — Phase 2: flags wired through `kit.heldFlags` / `kit.heldOverMcp`
  on all four providers, plus `record --held`. Jira turned out to use the shared
  apply too. MCP prints a note rather than a reshaped plan.
