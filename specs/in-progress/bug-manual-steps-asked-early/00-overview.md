---
github_identifier: "#306"
github_url: "https://github.com/SkitterByte/skitterspec/issues/306"
---

# Bug: /spec-next asks for manual-step results before they can be done

> **Type:** Bug
> **Name:** bug-manual-steps-asked-early
> **Author:** Reuben Greaves
> **Raised:** 2026-11-24
> **Area:** `spec-next/SKILL.md` §3 *Manual steps*; review button sets; `spec-env live take` output
> **Docs:** reference, review, index

## Symptom

At the first manual step `/spec-next` printed the steps and, in the same turn,
asked **All done / Some failed / Not yet** through the harness's question
picker. Seen in ereqs on `feat-removed-step-landing-mark` phase 2, 2026-11-24:

- Claude Code's question dialog can hide the text before it, so the operator
  saw "how did it go?" with no steps.
- The work was not reachable yet — not live (`/spec-live`), not on main
  (`/spec-to-main`) — so the question came before testing was possible.

Operator: "you keep asking me that before I've even had chance to put the
feature to main or list the actual steps for testing".

Two more, reported in the same session:

- "I got no review page" — the stop skipped §5 entirely, so the code built
  before the manual step had no page.
- "when I tried /spec-live then there were uncommitted changes blocking the
  move" — that code was uncommitted, so `live take` refused the dirty
  worktree — "AND when it is blocked it doesn't shout very loudly - the result
  looks pretty much the same as when a spec-live DOES work".

Blast radius: every phase with a manual task, in every project. No local
workaround. `/spec-next` is the only skill that asks for a manual-step result.

## Root cause

`packages/common/assets/skills/spec-next/SKILL.md` §3 *Manual steps* says to
list the steps "Then ask one question, with three answers" — listing and asking
are one turn. It never names how to reach the work, and never says the steps
must sit in the question itself when a picker is used. It also says "no page,
no arm, no wait" for the stop, so the green code half is neither shown nor
committed — and an uncommitted worktree is one `live take` refuses. That
refusal, in `packages/common/src/cli.js` `specEnvLiveTake`, printed one line
opening `spec-env live take: blocked — …`, the same prefix as the success
line.

## Failing test (red)

`packages/common/test/assets-manual-steps.test.js` — four new tests: the first
listing ends the turn and asks no question (and the answers come after that
instruction); `Next` names `/spec-live` / `/spec-to-main` first; the operator's
next message, or a later run, resolves it; a picker carries the steps in its
question text; the stop renders `--buttons manual` and arms nothing; `Next`
reads `/commit`, then `/spec-live`. Plus: a refused take leads with `✖ NOT LIVE`
(`cli-spec-env-live.test.js`, with a stays-silent twin), and the `manual`
button set offers Commit without Continue (`assets-review.test.js`) and narrows
a served re-render (`env-serve-buttons.test.js`). Run
`node --test packages/common/test/assets-manual-steps.test.js`.

```
✖ the first listing ends the turn and asks no question
✖ Next names how to reach the work before the steps
✖ the operator's reply resolves it, or a later run asks
✖ a picker carries the steps in its question text
ℹ pass 8
ℹ fail 4
```

## Fix

- [x] Rewrite §3 *Manual steps*: the first listing ends the turn with a `⚠️`
      block whose `Next` first names how to reach the work (`/commit`, then
      `/spec-live` or `/spec-to-main`), then the steps a row each, and asks no
      question
- [x] The operator's next message resolves it, or a later `/spec-next`
      re-lists and asks once the operator has come back; a picker carries the
      steps in its question text
- [x] The stop renders a page with a new `manual` button set (Commit, no
      Continue) and does not arm — `review.js`, `serve.js`, `page.html`
- [x] `live take` refusals and failures lead with `✖ NOT LIVE — … nothing
      switched`
- [x] Update `docs/reference.html`, `docs/review.html`; stamp them and
      `index`
- [x] Failing tests now pass (GREEN); `pnpm build` and `pnpm test` — 5523
      passed, 0 failed

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | update | `/spec-next` §3 *Manual steps* — list, end the turn; ask only on return |
| Config key | add | `spec-env review --buttons manual` (Commit, Request changes, Discuss) |
| CLI command | update | `spec-env live take` — refusal leads with `✖ NOT LIVE` |
| Docs | update | `docs/reference.html` `/spec-next` row, `docs/review.html` buttons |

## Changelog

- 2026-11-24 — Bug reproduced; failing test added (red).
- 2026-11-24 — Scope widened by the reporter: no page at the stop, the
  uncommitted code blocking `/spec-live`, and a refusal that reads like
  success. Same incident, same ref.
- 2026-11-24 — Fixed: §3 ends the turn at the stop with a `manual` page and a
  `/commit, then /spec-live` Next; `live take` refusals lead with NOT LIVE;
  tests green
