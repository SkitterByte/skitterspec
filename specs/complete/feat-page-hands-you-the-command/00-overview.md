---
linear_identifier: "SKS-241"
linear_url: "https://linear.app/skitterbyte/issue/SKS-241/the-page-hands-you-the-command-not-just-the-code"
---

# The page hands you the command, not just the code

> **Type:** Feature
> **Name:** feat-page-hands-you-the-command (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-09-14)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-14
> **Area:** packages/common/assets/review/page.html, packages/common/assets/skills/spec-reviewed, packages/common/src/env/review.js, packages/common/test
> **Stack:** worktree

## Problem

`bug-page-says-the-old-way` made the page name the command — *"Sent — run
/spec-reviewed to pick it up. It should say code 608223"* — which is correct and
still leaves the operator typing a slash command and six digits **on a phone**,
into a different app, from memory of what the page said.

The whole reason this page exists is that reading a diff happens away from the
keyboard. Naming the command was the fix for describing the wrong workflow; it
is not the fix for having to retype one.

## Decisions

1. **Offer the whole command, not the code.** `/spec-reviewed 608223`, ready to
   paste. Copying a bare `/spec-reviewed` leaves the disambiguation to a
   conversation that a paste could have settled.
2. **The code in the command removes the verification round-trip entirely.**
   `feat-claim-by-confirmation` had the agent name the code back so the operator
   could check it against their screen — verification instead of transcription.
   A code pasted **from your own page** is definitionally yours, so there is
   nothing left to verify: the check existed because the agent was proposing a
   code, and here the operator is supplying one.
3. **This is not a security loosening.** The code still travels through the
   chat, still from the person, and `/spec-reviewed` is still user-only. It is
   the original "read the code out" design with copy-paste instead of typing.
   A device that reaches the page still cannot reach the conversation.
4. **`/spec-reviewed` gains a third argument shape**, and that is the one
   contract change: a spec name, a tracker id, or **a six-digit code**. The
   shapes are unambiguous — nothing else matches `^\d{6}$` — so the parse needs
   no flag. A code that matches nothing refuses exactly as `--claim` does, and
   names nothing.
5. **The fallback is the expected path here, not the exception.**
   `navigator.clipboard` requires a **secure context**, and a page served on
   `http://192.168.0.136:7777` is not one — plain HTTP on a LAN address. So on
   the phone this feature is for, the clipboard API will usually be absent and
   the command must be offered as **selectable, pre-selected text** instead. A
   button that silently does nothing there is worse than no button.
6. **One control, not a second bar.** The command goes where the "Sent" hint
   already is, because that is where the reader is looking at the moment they
   need it.

## Solution overview

```
  press a verdict ▶ Sent

    ┌──────────────────────────────────────────────┐
    │ /spec-reviewed 608223            [ Copy ]    │   clipboard available
    └──────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────┐
    │ /spec-reviewed 608223                        │   no clipboard (the usual
    │ (selected — copy it)                         │   case on a LAN page)
    └──────────────────────────────────────────────┘

  paste into the chat ▶ /spec-reviewed claims exactly that pass
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Page | update | the sent hint offers the whole command, copyable or pre-selected |
| Skill | update | `/spec-reviewed` takes a six-digit code as a third argument shape |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The skill takes a code | ✅ | [01-skill-takes-a-code.md](01-skill-takes-a-code.md) |
| 2 | The page offers the command | ✅ | [02-page-offers-it.md](02-page-offers-it.md) |

## Non-goals

- **Making the page send the command for you.** Nothing pushes into the session;
  that is `feat-review-post-back`'s Non-goal and it stands. The paste is the
  human act, and it is the act the whole design rests on.
- **HTTPS for the review server.** A certificate would make the clipboard API
  available and is a much larger thing than this — Decision 5 handles the
  consequence rather than the cause. Worth its own spec if it ever matters.
- **Dropping the verify-by-echo flow.** It stays for the case it was written
  for: the operator says a pass is waiting without pasting a code, and the agent
  names one back. Pasting is the faster path, not the only one.

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-14 | Ready | backlog | Reuben Greaves |
| 2026-09-14 | In Progress | in-progress | Reuben Greaves |
| 2026-09-14 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-14 — Completed; both phases done, tests green (2322).

- 2026-09-14 — Phase 2: the shim needed the three new ids registering by hand.
  It reads each element's *initial hidden state* off the template so it cannot
  drift, but the id list itself is still hand-maintained — a gap that costs a
  confusing `null` rather than a wrong pass, so it is noted, not widened here.
- 2026-09-14 — Phase 2: the **hint keeps the sentence and the field carries the
  command**, rather than the hint carrying both. The command has to be copyable,
  and text inside a paragraph is not — so the split is what the feature needs,
  not a layout preference. The test asserts both halves so neither can vanish.

- 2026-09-14 — **Premise overturned mid-spec.** The six-digit code was designed
  as a verification: the page pushed, the agent went looking, so it had to prove
  *which* pass it had found. `/spec-reviewed` being user-only removed that
  channel — the agent now acts only because a person typed the command, and a
  LAN device cannot type. So the echo-and-confirm was a round-trip that
  confirmed nothing, and it is gone. The code's one remaining job is **telling
  two passes apart**: an address, not a password. One waiting pass is claimed and
  acted on outright; two is a refusal to guess; a pasted code skips even that.
  Phase 1's own prose was rewritten on the new premise, and `CLAUDE.md`,
  `claude-md-section.md` and `spec-planning.md` with it.
- 2026-09-14 — `/spec-diff` step 0 keeps the old rule deliberately. That skill
  **is** model-invocable, so "never claim a pass you were not asked to" still
  guards a real path there. The change is specific to the user-only skill, and
  the two must not be collapsed.

- 2026-09-14 — Phase 1: the shape test found a **pre-existing** overlap the code
  shape does not have — `bug-12345` is a legal spec name that also matches the
  tracker-id shape. Out of scope here and left as it was; recorded rather than
  quietly asserted away.
- 2026-09-14 — Phase 1: the "must not restore the echo" sentence was split in
  two, because the bold span crossed a hard line break and
  `.claude/rules/spec-planning.md` forbids that. The guard caught it.

- 2026-09-14 — Spec created, from the operator's suggestion that the page offer
  to copy the command. Grilling turned up the constraint that shapes it:
  `navigator.clipboard` is secure-context-only, so on the LAN-served page this
  is *for*, the button will usually degrade to selectable text — which makes the
  fallback the main path rather than the edge, and is why Decision 5 is a
  decision rather than a detail.
