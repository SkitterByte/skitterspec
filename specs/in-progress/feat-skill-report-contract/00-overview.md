---
linear_identifier: "SKS-191"
linear_url: "https://linear.app/skitterbyte/issue/SKS-191/one-report-block-every-skill-ends-with"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# One report block every skill ends with

> **Type:** Feature
> **Name:** feat-skill-report-contract (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — all phases done (started 2026-09-12)
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
2. **Verdict line, then a two-column markdown table.** ~~An aligned key-value
   list, not a table~~ — overturned 2026-09-13 after reading one in anger, see
   Changelog. The aligned column only exists inside a fenced block, because
   markdown collapses runs of spaces outside one; and a fenced block in a
   terminal reads as *code the model wrote*, not as a report. Given the choice
   between alignment and being recognised as a report, the report wins.
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
   **It is second to last**, above `Next` (decision 13).
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
11. **The block is the last thing on screen, and the diff offer is a row in
    it.** This reverses the rule phase 2 shipped, where the offer was prose
    *after* the report. The reasoning that put the offer last still holds; what
    changed is that the block itself is now scannable enough that a labelled row
    inside it is not a hiding place, which a fenced block's fourth line was.
    **`Diff` and the offer are one row, not two** — the field is renamed
    `Review` and carries the counts, the link and the question together. Two
    adjacent rows pointing at the same page is a distinction the reader has to
    resolve before acting on either.
12. **`Next` stays inside the block.** It was the field the operator went
    looking for and could not find, and the fix for that is the table, not
    eviction.
14. **`Tracker` is the first row**, carrying the tracker id linked to the issue
    where the spec has a url, **the spec's folder name beside it**, and what
    changed there. The pair is the identity: the id addresses the work outside
    the repo, the name addresses it inside. The name also appears in the verdict
    line, and that repetition is deliberate — this row is absent in a project
    with no provider, so the verdict line has to carry the name on its own. It is the handle for
    everything outside the repo, and a tappable one is the difference between
    reading a report on a phone and going to look for the ticket. It stays a
    **row** rather than moving into the verdict line: the line is already
    carrying state, skill, spec and clause, and a fifth segment is where a
    one-line summary stops being scannable. Stated tracker-neutrally in the
    rule, which ships in the base where no provider exists — with none installed
    the row is simply absent.
13. **Row order, set by reading real ones:** `Tracker` · `Why` (non-`✅` only) ·
    `Branch` · `Spec` · `Cause` · `Built` · `Tests` · `Landed` · `Worktree` ·
    `Review` · `Follow-ups` · `Next`. It runs identity → context → what happened
    → where it went → what to do. **`Tracker` is first** (decision 14) and
    **`Next` is last**, because the id is what you leave with and `Next` is the
    only row you act on. `Review` sits above `Follow-ups` rather than at the
    bottom: the offer does not need the final row once it has a label column to
    be found by, and the closing row should be the one that moves the work on.
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
| 1 | Write the contract rule and bring it under the prose guard | ✅ | [01-contract-rule.md](01-contract-rule.md) |
| 2 | Retrofit the 11 lifecycle skills, enforced by test | ✅ | [02-common-skills.md](02-common-skills.md) |
| 3 | Re-render the block as a table, then the 6 Linear skills | ✅ | [03-linear-skills.md](03-linear-skills.md) |
| 4 | Update the outward-facing surfaces | ✅ | [04-docs.md](04-docs.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-12 | Ready | backlog | Reuben Greaves |
| 2026-09-12 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-12 — Spec created.
- 2026-09-13 — Phase 1: the prose guard's hand-written `spec-planning` entry
  became discovery of `assets/rules/*.md` across both packages, so
  `negative-checks.md` and the provider's `commit-trailers.md` came under it too
  — both had shipped unguarded. Discovery is itself an absence that can go
  quiet, so a vacuity test names one file per discovered kind.
- 2026-09-13 — Phase 1: the rule's worked examples say `npm test` and name no
  tracker. `assets.test.js` forbids `pnpm` in shipped prose and
  `compose.test.js` forbids Linear brand text in the base build — the examples
  are shipped into other people's repos, so neither this repo's toolchain nor a
  provider's name belongs in them.
- 2026-09-13 — Phase 2: the contract's field order put `Worktree` before
  `Landed`; `/spec-complete` is the only skill emitting both and it lands before
  it tears down, so the rule's table was flipped to match. The worked example in
  the rule had already been written that way.
- 2026-09-13 — Phase 2: the offer-last rule and the block would each have
  claimed to be last. Resolved in favour of the block being the report and the
  offer following it; `/spec-next`'s step 5 anchor moved from "after the
  `Next: phase N` line" to "after the report block", and
  `assets-offer-last.test.js` gained a test that the two statements agree
  rather than losing the two that named the old anchor.
- 2026-09-13 — Phase 2: `/spec` and `/spec-start` had no `## Report` section at
  all and gained one. `/spec-start`'s says to emit no block when it carries on
  into `/spec-next`, since that skill ends with its own — two blocks for one run
  is the noise the contract exists to remove.
- 2026-09-13 — Phase 2: `/spec-complete` and `/spec-cancel` may not say "mirror"
  in the tracker-free base (`build-dist.test.js`), so their verdict bullets say
  "a tracker refresh that failed". The one statement about `Tracker` being
  conditional on a provider lives in the rule instead of in each skill.
- 2026-09-13 — **Decision 2 overturned by use.** The first real reports in the
  new shape read as "code the model wrote" rather than as a report, and the
  operator did not find `Next` in one — the exact scanning failure the contract
  was written to fix, reproduced by its own format. Four renderings were
  prototyped live in the terminal (fenced block, bullet list, table, prose) and
  the table was chosen: it keeps a real label column, it is unmistakably not
  code, and the phone-reflow objection that originally rejected it turned out to
  cost less than being mistaken for a code sample.
- 2026-09-13 — **The offer moves inside the block** (decisions 11 and 12), which
  reverses phase 2's "the offer is the last thing on screen, after the report".
  The invariant underneath is unchanged — the offer is still the last thing the
  reader sees — but it is now the last *row* rather than the paragraph after the
  last row. `assets-offer-last.test.js` is rewritten in phase 3 around the new
  anchor rather than deleted: what it guards is that the offer is not buried,
  and that is still true and still worth a test.
- 2026-09-13 — The offer's row is called `Review`, accepting that the word is
  already carrying the review *page* and the review *pass*. It **replaces**
  `Diff` rather than joining it: the first draft gave the page a row and the
  offer another, which read as two things to decide between when there is only
  one page and one question about it.
- 2026-09-13 — The rework lands in phase 3 rather than amending phase 2. Phase
  2's fenced version is left in history on purpose: the reason the format
  changed is that someone read the fenced one, and a commit that never happened
  makes the Changelog above unreadable.
- 2026-09-13 — Row order fixed (decision 13) after reading a live block: `Next`
  moved from mid-table to the **last** row and `Review` from last to above
  `Follow-ups`. The earlier arrangement put the question where the eye stops,
  and the instruction where it does not — backwards, since only one of the two
  is something to do.
- 2026-09-13 — The tracker id is the **first row** rather than a fifth segment
  of the verdict line (decision 14) — tried on the line first, and it made the
  one line that has to be scannable at a glance the longest one in the block.
- 2026-09-13 — The `Tracker` row carries the spec name beside the id
  (decision 14), so the first row is the full identity of the work.
- 2026-09-13 — Phase 3: the block must report **this run and nothing else** — no
  other specs, no backlog, no repo-wide status. A completion that surveys what
  is left leaves the reader unable to tell what followed from the run they just
  watched, which is the cost the block exists to remove. Stated in the rule and
  again in `/spec-complete`, where it actually happened, and guarded.
- 2026-03-13 — Phase 3: `assets-offer-last.test.js` was re-pointed rather than
  relaxed, and now carries a note saying what must not be weakened if the anchor
  moves a third time — findable, addressed to someone, link and question in one
  row. If a future change loosens those instead of re-pointing them, the honest
  move is to delete the guard.
- 2026-09-13 — Phase 3: the contract test now compares its skill list against
  what actually ships and fails on a mismatch, so a new skill cannot arrive
  without an ending. `build-dist.test.js` gained the untested overlay direction:
  a **common** rule surviving into the provider superset, which had no symptom
  because the provider-rule assertion beside it would still have passed.
- 2026-09-13 — Phase 4: the block is described on `spec-planning.md`,
  `claude-md-section.md`, the two distribution READMEs, `packages/common`'s and
  `docs/index.html` — each showing one worked block rather than describing one.
  The root `README.md` was left alone: it is the monorepo's developer README
  (distributions, build, releasing) and describes no skill behaviour, so a
  product section there would be the only one of its kind.
- 2026-09-13 — Phase 4: `docs-claims.test.js` gained a retired-shape guard —
  no surface may describe the block as an aligned key-value list — paired with
  a positive signal, since a surface that dropped the example entirely would
  otherwise pass by absence. Its skill-name guard also had to learn the `.md`
  lookahead `assets-prose.test.js` already had: pointing readers at
  `.claude/rules/spec-reports.md` was read as naming a skill that does not ship.
