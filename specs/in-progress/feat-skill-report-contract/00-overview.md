---
linear_identifier: "SKS-191"
linear_url: "https://linear.app/skitterbyte/issue/SKS-191/one-report-block-every-skill-ends-with"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# One report block every skill ends with

> **Type:** Feature
> **Name:** feat-skill-report-contract (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-12)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-12
> **Area:** packages/common/assets/rules/spec-reports.md, packages/common/assets/skills, packages/linear/assets/skills, packages/common/assets/rules/spec-planning.md, packages/common/assets/claude-md-section.md, packages/common/test, README.md, docs/index.html
> **Stack:** worktree

## Problem

Every lifecycle skill ends with a free-prose instruction to summarise — *"root
cause, the failing→passing test, the fix, and the full test result"* in
`/spec-bug`, *"the move, the commit, the final test result"* in `/spec-complete`,
eleven more like them. Each run the model composes that summary from scratch, in
whatever shape it lands on, on top of narrating mid-run what it is about to do
and why. The narration is near-identical every time, because it *is* the skill
doing its job: the same worktree gets provisioned, the same spec gets moved, the
same teardown runs.

Two costs. Tokens are spent re-deriving words that never vary. And there is no
consistent artefact to scan: whether a run worked, half-worked, or refused before
touching anything is buried in a paragraph whose shape changes run to run — which
is exactly the question you have when you come back to a long phase on a phone.

A third gap sits alongside them. Implementing a phase routinely surfaces
something that needs its own spec — a wrong assumption, a missing guard, a
decision the spec deferred. Today it gets mentioned in passing and lost, because
nothing in the skills asks for it and nothing keeps it.

## Decisions

1. **One canonical block, defined once in a shipped rule.** A new
   `.claude/rules/spec-reports.md` carries the shape; each skill's `## Report`
   shrinks to naming the fields that apply to it. Rejected: rendering the block
   from the CLI (`skitterspec report`). The engine can supply the frame — spec,
   status, folder, branch, worktree, tracker id — but the fields that make a
   report worth reading (test result, what was built, root cause, follow-ups) are
   exactly the ones it cannot know, so the model would still compose the content
   and a new CLI surface would buy only the frame. Revisitable once the shape has
   settled in use.
2. **Verdict line, then an aligned key-value list** — not a table. These get read
   on a phone, where a two-column markdown table reflows into noise and a label
   column does not.
3. **Four verdict states, refusals included:** `✅` done · `⚠️` done with caveats ·
   `❌` failed part-way · `⏸` refused before acting. The last two are different
   facts about the repo, and the difference decides what you do next: a failed
   landing left a conflicted rebase and a standing worktree, a refusal changed
   nothing. A refusal emits the block too, so every invocation ends the same way
   and "nothing happened" is a reported outcome rather than an absent one.
4. **Silence during the run.** The rule bans narrating what a skill is about to
   do or why. Mid-run the model speaks only to ask a question it cannot answer
   itself, or to report a failure at the moment it happens. Rejected: keeping
   terse progress markers — tool calls are already visible, so a marker line per
   step re-states what the transcript shows.
5. **`Follow-ups` is an always-present field** — `none`, or one line each. This
   is the Gating header's logic applied to the report: a recorded `none` is a
   decision, a missing line is an oversight. The bar is deliberately high: only
   what *this* work surfaced that *this* spec will not fix. Not "could be
   tidier", and not anything already in the spec's Open questions.
6. **A surfaced follow-up is offered, and recorded when declined.** Offer to
   `/spec` it on the spot; if the user does not take it, write one dated line
   into the spec's Changelog so it outlives the session. Rejected: a shared
   `specs/.core/follow-ups.md` queue — it would be a second backlog with no
   lifecycle, drifting against the real one.
7. **The offer names where the spec would be written.** `/spec-next` and friends
   run inside the spec's own worktree, and a spec authored there physically lives
   on that branch — invisible on the base branch, and cancelled along with its
   host. The offer says so and points at the primary checkout, the reasoning
   already being in `spec-planning.md` and `commit-trailers.md`.
8. **All 17 skills**, across `packages/common/assets/skills` and
   `packages/linear/assets/skills`. One shape everywhere beats a rule about which
   kind of skill gets which ending. The `packages/skitterspec*` trees are built
   from these and gitignored, so nothing is edited there.
9. **Behavioural guidance inside today's `## Report` sections stays.** Lines like
   *"Do not `git commit` unless the user asks"* and the hotfix's *"never push a
   tag"* are behaviour, not report shape — they move above the block rather than
   being deleted with the prose around them.
10. **Enforced by test, like every other shipped-prose rule here.** A new
    `assets-report-contract.test.js` asserts each skill defers to the contract
    and declares its fields, and the new rule joins the prose guard. That guard
    learns to *discover* `assets/rules/*.md` rather than list them, the way it
    already discovers `assets/core/*.md`, so the next rule is covered the day it
    lands instead of the day someone remembers.

## Solution overview

The contract defines one block and nothing else:

```
✅ /spec-next · feat-foo · phase 2/4

Built       POST /orders handler, orders schema
Tests       128 passed · pnpm test
Branch      spec/feat-foo · 3 commits, clean
Diff        .spec-env/reviews/feat-foo.html
Next        /spec-next → phase 3 (Auth)
Follow-ups  none
```

The verdict line is `<state> /<skill> · <spec> · <one clause>`. Fields come from
a fixed vocabulary in a fixed order; a skill emits only those it declares, except
`Follow-ups`, which is always last and always present. A non-`✅` verdict adds a
`Why` field and quotes the failing output — the one place the block is allowed to
grow.

A refusal has no spec to name and says so instead:

```
⏸ /spec-next · no spec in flight

Why         Not standing in a worktree, and 2 specs are provisioned.
Next        /spec-start <name>, or cd into one of:
              ../skitterspec-wt/feat-connect-planner
              ../skitterspec-wt/feat-review-verdict
Follow-ups  none
```

Each skill's `## Report` becomes a few lines: the verdict states that apply to
it, its field list, and any behaviour that was already there.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | add | `assets/rules/spec-reports.md` (new shipped rule, auto-installed) |
| Skill/rule | update | `## Report` in 17 `SKILL.md` files |
| Skill/rule | update | `spec-planning.md`, `claude-md-section.md` — name the contract |
| Test | add | `assets-report-contract.test.js` |
| Test | update | `assets-prose.test.js` — discover `assets/rules/*.md` |
| Docs | update | `README.md`, `docs/index.html` |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Write the contract rule and bring it under the prose guard | ⬜ | [01-contract-rule.md](01-contract-rule.md) |
| 2 | Retrofit the 11 lifecycle skills, enforced by test | ⬜ | [02-common-skills.md](02-common-skills.md) |
| 3 | Retrofit the 6 Linear skills, extend the guard to all 17 | ⬜ | [03-linear-skills.md](03-linear-skills.md) |
| 4 | Update the outward-facing surfaces | ⬜ | [04-docs.md](04-docs.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-12 | Ready | backlog | Reuben Greaves |
| 2026-09-12 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-12 — Spec created.
