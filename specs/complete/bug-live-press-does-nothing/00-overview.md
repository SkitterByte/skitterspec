---
linear_identifier: "SKS-345"
linear_url: "https://linear.app/skitterbyte/issue/SKS-345/bug-the-review-pages-live-press-does-nothing"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: the review page's live press does nothing

> **Type:** Bug
> **Name:** bug-live-press-does-nothing (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-09-18)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-18
> **Area:** `packages/common/src/cli.js`, `packages/common/assets/review/page.html`, `packages/common/src/env/review.js`, `packages/common/assets/hooks/review-gate.cjs`

## Symptom

Pressing **`▶ Put it live`** on a served review page has no effect at all.

The page POSTs the action blob, gets a code back, and shows `Sent — reload when
it is done`. The waiting `/spec-next` run then claims that pass and reports:

> ⚠️ **Pass claimed, but it carried no verdict**
> 740517 arrived and was claimed, but the engine recorded no decision on it —
> no verdict, no accepts, no comments.

So the reader is told their press concluded nothing, the action is never
performed, and the gate is (correctly) still armed. Running `/spec-live` by hand
afterwards then refuses a second time, for a different reason:

    spec-env live take: blocked — feat-…'s worktree has uncommitted changes —
    commit or stash them first (the rebase cannot run over them).

## Root cause

Three separate defects on one press. Only the first is load-bearing.

1. **The claim drops the action** — `packages/common/src/cli.js:2820`. When a
   pass is claimed, the CLI builds
   `claimed = { code, at, remaining, accepted, unaccepted, comments }` and sets
   `sentVerdict = parsed.verdict`. `parsed.action` is never read. So a claimed
   `live-on` pass is byte-identical, in both the human output and `--json`, to a
   pass carrying nothing: `claimed: 740517 — 0 accepts, 0 withdrawn, 0 comments`.
   `/spec-diff` §2 routes on what the engine reports, so §2b ("an action changes
   something, then hands the page back") can never fire. Validation accepts the
   action (`env/review.js:1522`) and the *pending* list prints it
   (`cli.js:3336`) — it is only the claim that swallows it.

2. **The button's label hides a commit** — `assets/review/page.html:2619`,
   `ACTION_LABEL['live-on'] = '▶ Put it live'`. `live take` refuses a dirty
   worktree, so `/spec-diff` §2b commits the phase first as a precondition. A
   press therefore commits, behind a label that says only "put it live" — which
   is why the second refusal above was a surprise rather than an expectation.

3. **A midrun page offers a press that can never work** —
   `env/review.js:613` attaches `action: 'live-on'` to the live row whenever
   `live.state === 'off'`, with no regard for the button set. `/spec-diff` §2b
   explicitly refuses to commit half a phase, so on a `--buttons midrun` page the
   press is guaranteed to be declined.

Adjacent, and included by request: the gate's exit is correct but unreachable in
practice. `assets/hooks/review-gate.cjs:127` names
`skitterspec spec-env review skip "<reason>"` — a CLI incantation nobody retypes,
delivered to Claude rather than to the reader.

## Failing test (red)

`packages/common/test/env-review-claim-action.test.js` — new. Holds a pass
carrying `action: "live-on"` the way the serve endpoint does, claims it, and
asserts the claim names the action in both the text report and `--json`.

    ✖ claiming an action pass says which action it carried
      Expected values to be strictly deep-equal:
      + actual - expected
      + undefined
      - 'allow-remote'

Run: `node --test packages/common/test/env-review-claim-action.test.js`

Its other two tests are the stays-silent half
(`.claude/rules/negative-checks.md` rule 3): a claim reporting an action must
not let it fill the verdict slot or discharge the gate. Both passed before the
fix, which is the point of them.

## Fix

Phased; see the index below.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Report the action a claim took](01-claim-reports-the-action.md) | ✅ |
| 2 | [Say that the press commits](02-press-says-it-commits.md) | ✅ |
| 3 | [A typed exit from the gate](03-typed-exit-from-the-gate.md) | ✅ |

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI output | update | `spec-env review --claim` reports `action` (text + `--json`) |
| Review page | update | `live-on` label names the commit it performs |
| Engine | update | `surfacesFor` withholds `live-on` on a midrun button set |
| Skill/rule | add | `/spec-skip "<reason>"` command; gate refusal names it |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-18 | In Progress | in-progress | Reuben Greaves |
| 2026-09-18 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-18 — Completed; all three phases done, tests green (3358 passed).
  Landing this puts `/spec-skip` on the base branch, which
  `.claude/rules/offered-unblocks.md` (feat-offer-the-unblock) defers citing
  until it is there.

- 2026-09-18 — Bug reproduced; failing test added (red).
- 2026-09-18 — Fixed: the claim reports `action`, so `/spec-diff` §2b can
  fire; test green.
- 2026-09-18 — Fixed: the live button names the commit it performs, and a
  `midrun` page offers `/spec-live` as a command in place of a press it could
  never honour.
- 2026-09-18 — Added `/spec-skip "<reason>"`, the gate exit as a typed command.
  Rejected a reasonless `--force` and a `--force` on `/commit` — reasoning in
  phase 3.
- 2026-09-18 — Decided against changing the engine's own `armed` line to name
  the slash command: `spec-env review gate` is usable with no harness, where a
  slash command names nothing. The hook's refusal carries both forms.
