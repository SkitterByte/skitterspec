---
linear_identifier: "SKS-227"
linear_url: "https://linear.app/skitterbyte/issue/SKS-227/a-waiting-pass-is-claimed-by-confirmation-never-unasked"
---

# A waiting pass is claimed by confirmation, never unasked

> **Type:** Feature
> **Name:** feat-claim-by-confirmation (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-14
> **Area:** packages/common/src/cli.js, packages/common/src/env/review.js, packages/common/assets/review/page.html, packages/common/assets/skills/spec-diff, packages/common/assets/rules/spec-planning.md, packages/common/test
> **Stack:** worktree

## Problem

`feat-review-post-back` shipped a pass code whose stated job was that *"nothing
reaches the sidecar until you read the code to Claude"*. Within an hour of it
landing, the opposite happened: the operator pressed **✓ Approve** on their
phone, said nothing, and the agent read the code out of
`.spec-env/reviews/<spec>.pending.json` and claimed it anyway.

Nothing stopped that, and nothing could — the agent has the filesystem, so the
code can never be a *technical* gate against it. What the code actually protects
is **which** pass and **whether a person meant it**, and the skill never said so:
it described claiming as something that happens when a code arrives, with no rule
against going to fetch one.

So the threat the code was added for is currently open. A rogue device that
reaches the page can press Approve, and the pass it queues is indistinguishable
to the agent from the operator's own — one of them gets picked up, and the agent
has no reason to prefer the right one. Meanwhile the page's copy (`Sent · claim
it with 386552`) asks the operator to do something that, as things behaved, they
did not need to do.

## Decisions

1. **The agent never claims a pass it was not asked to claim.** This is the whole
   security property, and it is the only one that holds: a stranger can POST all
   day, and their pass sits pending forever because **they cannot reach the
   operator's session**. The chat is the one channel a device on the network
   does not have. Everything else here is ergonomics on top of that rule.
2. **The digits travel agent → operator, not operator → agent.** The render lists
   each waiting pass — code, verdict, age — and the agent *offers*: "an approval
   is waiting, code 386552 — yours?" The operator glances at their phone and
   says yes. **Verification, not transcription.** Rejected: the operator reading
   six digits out every time (correct, and a chore on every single review);
   auto-claiming a sole waiting pass (the exact fallback
   `feat-review-post-back` Decision 3 forbids, and the hole this spec closes).
3. **More than one waiting is never guessed.** The agent names them all and asks
   which. That is precisely the case where a stranger's pass sits beside the
   operator's, and the code stops being a courtesy and starts being the answer.
4. **A code that does not match is the operator's signal, not the agent's.** The
   agent cannot tell a rogue pass from a real one — both are well-formed JSON
   from the same URL. The operator can, in one glance, because their phone shows
   the code theirs was given. That is why the offer must **name the code** rather
   than describe the pass.
5. **A declined pass can be dropped.** Otherwise a rogue pass sits in the store
   forever, is reported on every render, and trains the operator to wave the
   report away — which is how the real one gets waved away too.
6. **No config key.** A stricter transcribe-only mode was offered and declined:
   one disposition, so the skill's rule is a rule rather than a setting whose
   value has to be read before the rule can be applied.

## Solution overview

```
  phone ──Approve──▶ engine holds it
  page shows:  Sent · code 386552 — tell Claude it's waiting

  render:  pending: 1 waiting
             386552 · approve · 2 min ago

  Claude:  an approval is waiting, code 386552 — yours?
  you:     yes            ▶ claimed, and routed on its verdict
           no             ▶ left, or dropped on your say-so
           (two waiting)  ▶ Claude names both and asks which
```

The security argument in one line: **a rogue pass cannot reach the review because
it cannot reach the conversation.** The code is what stops the operator
confirming the wrong one by accident.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI output | update | render lists each waiting pass: code, verdict, age |
| CLI | add | `spec-env review <spec> --drop <code>` |
| CLI | update | `--json` carries `pending[]`, not just a count |
| Page | update | copy stops instructing a transcription |
| Skill | update | `/spec-diff` — never claim unasked; offer, name the code, never guess |
| Rule/docs | update | `spec-planning.md`, the CLAUDE.md section, the docs site |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The engine describes what is waiting | ⬜ | [01-describe-waiting.md](01-describe-waiting.md) |
| 2 | The rule, and the words around it | ⬜ | [02-rule-and-words.md](02-rule-and-words.md) |

## Non-goals

- **Authenticating the sender.** The page is a browser with no identity, and
  nothing here tries to give it one. The operator's confirmation is the
  authentication, and it is the only one available.
- **Making the code a technical gate against the agent.** It cannot be — the
  store is a file the agent can read. Decision 1 is a rule, enforced by prose and
  a guard test, and the spec says so rather than implying strength it lacks.
- **Locking the endpoint down further.** Whether the token should be narrower, or
  writes restricted by source address, is a separate question about the server.
  This spec assumes the threat model it was given: someone who already has the
  page.

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-14 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-14 — Spec created, out of the agent claiming the operator's approval
  without being asked — an hour after shipping the feature whose stated rule was
  that it would not. The operator's framing set the requirement: stay closed
  against a rogue device that stumbles on the page, and still work when *they*
  press Approve on a phone and the agent on the PC accepts it. Those are only
  compatible because the chat is a channel the rogue device does not have.
