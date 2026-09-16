---
linear_identifier: "SKS-281"
linear_url: "https://linear.app/skitterbyte/issue/SKS-281/bug-the-sent-page-names-a-command-nobody-needs-to-run"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: the sent page names a command nobody needs to run

> **Type:** Bug
> **Name:** bug-page-cannot-tell-if-claimed (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — phase 1 green
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-16
> **Area:** `packages/common/assets/review/page.html`, `packages/common/src/env/serve.js`, `packages/common/src/env/review.js`, `packages/common/src/cli.js`

## Symptom

A served review page whose POST **succeeded** still ends on

```
Sent. Run this where Claude is: (selected — copy it)
/spec-reviewed 064749
```

— a small grey line under a verdict bar that has just closed, saying exactly
what it would say if nothing had been delivered at all.

In the normal case a session is waiting and `--claim-since` picks the pass up
the moment it lands, so the command is noise. In the case that is not normal it
is the only thing that saves the pass. The two look identical, and the reader
cannot tell which one they are in.

Reported while dogfooding 21.0.0 on `feat-say-what-was-dropped`. The premise in
the report — *"I thought that was only necessary when I'm not on the same
network"* — does not hold: six digits are only ever minted by the engine's
holding area, so that page **was** served and the POST **did** succeed. Nothing
fell back. The line is what the success path always says.

And the defensiveness behind it is earned, not paranoid: pass `070656`
(`commit-continue`, 16 Sep) and `416964` (`bug-review-gate-hook-install`,
15 Sep) are both still sitting unclaimed in their holding areas right now. So
"Claude is waiting for this" is true often — and not always.

## Root cause

`page.html:1650` (`post`) names the command on **every** successful POST, and
`page.html:1411` (`drawDecided`) replays it on every re-open. The page has no
way to know whether a session is waiting, because nothing ever told it: the
wait window lives entirely in the skill (`passesSince`,
`packages/common/src/env/review.js:773`) and is never registered anywhere the
server can see, and `createReviewServer` (`packages/common/src/env/serve.js:391`)
serves exactly two things — a diff page and a POST endpoint. There is no way to
ask what became of a pass, so the page guesses, and it guesses the same way
every time.

## Failing test (red)

Three files, one per layer:

- `packages/common/test/env-review-pass-state.test.js` — `passState()` resolves
  a code to `waiting` · `claimed` · `unknown` from positive signals only.
- `packages/common/test/env-serve-pass-state.test.js` — `GET <spec>?pass=<code>`
  answers that state as JSON, and tells a prober nothing a GET did not.
- `packages/common/test/assets-review.test.js` — the page asks, and says the
  one thing that is true.

Run: `node --test packages/common/test/env-review-pass-state.test.js
packages/common/test/env-serve-pass-state.test.js
packages/common/test/assets-review.test.js`

```
✖ a sent pass is checked, not guessed about
  AssertionError: the page asked what became of the pass
✖ a pass Claude picked up names no command at all
✖ a pass still sitting there hands over the command, loudly
  AssertionError: it sits in the You chose box
✖ a code sitting in the holding area is waiting
  TypeError: passState is not a function
```

## Decisions

**The page asks rather than being told.** The alternative was a wait marker the
waiting skill registers with the engine, which the POST reply then reports. It
is less code and it fails in exactly the direction that costs the most: a
session killed mid-wait leaves the marker saying someone is listening, and the
pass strands in silence — the failure this spec exists to fix, wearing a
confident face. Asking what became of the pass has a positive answer on both
sides and no state to go stale.

**`claimed` is what the claim wrote down, never what the store is missing.**
Four different things make a code absent from the pending store and only one of
them is a claim (`--drop` is another, a moved store and a folder typo are two
more). So `appendDecision` records the code, and absence alone never speaks —
`.claude/rules/negative-checks.md` rule 1.

**Cannot-tell keeps the command.** An unreadable sidecar, an older daemon with
no lookup, a poll that never came back: all `unknown`, and `unknown` hands the
command over. A command nobody needed costs a glance; a pass nobody claims
costs the review — rule 4.

**The command moves into the You chose box, as an action.** It is the one thing
left to do and it was sitting below a bar that had just closed, in the type size
of a footnote.

**And it is plain text, not a readonly input.** A field reads as something to
type into, and on a phone tapping one raises a keyboard for a value nobody can
change. `user-select: all` makes one tap take the whole command — the gesture
that still works on a page served over plain http, where the clipboard API is
withheld — and where even `getSelection` is absent the lead says *copy it*
rather than claiming a highlight that is not there.

**A page with no transport offers commands instead of buttons** (phase 2). A
verdict button on a `file://` page cannot deliver anything, so it hands over a
JSON blob to paste. Each verdict becomes a row instead — **labelled with the
button's own name**, `✓ Commit & Continue` rather than `commit-continue`, since
the word the reader chooses is the word on the button — carrying the command
that sends it and a Copy control. A pass carrying accepts or comments cannot fit
in a command line, so those rows fall back to the blob rather than silently
dropping what the reader wrote.

## Fix

- [x] `passState(out, spec, code)` in `review.js` — `waiting` · `claimed` ·
      `unknown`, from positive signals, never touching disk for a code that is
      not six digits.
- [x] `appendDecision` records the claimed `code`, so `claimed` has something
      present to assert.
- [x] `createReviewServer` grows a `passState` seam and answers
      `GET <spec>?pass=<code>` as JSON; no lookup wired → `unknown`, never a 500
      and never the diff page.
- [x] The page polls its own URL after a successful POST, and ends on what came
      back: `claimed` → no command at all; anything else → the command, in the
      decided panel, marked as an action.
- [x] Failing tests now pass (GREEN); run `node --test`. Confirm no regressions.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| HTTP route | add | `GET /<token>/<spec>?pass=<code>` → `{state}` (read-only) |
| Page | update | polls after POST; command moves into `.decided` as a filled callout, rendered as `<code>` rather than a readonly input |
| Sidecar | update | `notes.decisions[].code` — the claimed pass, `null` where there was none |
| Engine API | add | `passState()`; `createReviewServer({ passState })` |

## Phase index

| Phase | Goal | Status |
|-------|------|--------|
| [01](01-ask-what-became-of-it.md) | The served page asks, and says what is true | ✅ |
| [02](02-commands-where-buttons-cannot-work.md) | A page with no transport offers commands, not buttons | ⬜ |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-16 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-16 — Bug reproduced; failing tests added across all three layers (red).
- 2026-09-16 — Premise corrected: the page was served and the POST succeeded.
  Nothing fell back — the command is what the success path always says.
- 2026-09-16 — Fixed (phase 1): the page asks `?pass=<code>` what became of its
  pass and ends on the answer; `claimed` is read off a decision log that names
  the code, never off the code being gone. 2565 tests green.
- 2026-09-16 — Review (`331951`, commit-continue): the command box became plain
  text with a Copy control instead of a readonly input. Proven live on the real
  store — that pass read `waiting`, then `claimed` once it was picked up.
