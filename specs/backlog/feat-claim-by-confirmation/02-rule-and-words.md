---
linear_issue_id: "SKS-229"
---

# Phase 2 — The rule, and the words around it ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-diff` never claims a pass it was not asked to, offers by naming
the code, and refuses to guess between two — and every surface stops telling the
operator to transcribe digits they do not need to transcribe.

## Tasks

- [ ] Write the rule into `/spec-diff` §2, in the strongest terms the file uses:
      **never claim a pass the operator did not ask for.** Say why it is the only
      security property that holds — a rogue device can reach the page but not
      the conversation — and say plainly that reading the code out of
      `.pending.json` to claim it yourself defeats the feature entirely. That is
      not hypothetical: it is what happened, and prose that does not name it will
      not prevent it.
- [ ] Write the offer: name the **code**, the verdict and the age, and ask
      whether it is theirs. Never describe the pass instead of naming its code —
      the code is the only part the operator can check against their phone
      (Decision 4).
- [ ] **Two or more waiting is a refusal to guess**, not a preference. Name them
      all and ask which; never take the newest, the oldest, or the only approve.
- [ ] On a "no": leave it, and offer `--drop <code>`. A rogue pass that stays in
      the store is reported on every render until the operator stops reading the
      line.
- [ ] Fix the page copy: it currently says `Sent · claim it with 386552`, which
      instructs a transcription the design does not need. It should say the pass
      was sent, show the code as the thing to **check**, and point at telling
      Claude rather than at typing digits.
- [ ] Update `spec-planning.md`, the CLAUDE.md section and the docs site: the
      round-trip ends in a confirmation, and the security argument — the chat is
      the channel a rogue device does not have — is the part worth stating.
- [ ] Tests: the skill prose pins the never-unasked rule, the offer-by-code, and
      the refusal to guess between two; a guard that the prose names the
      read-it-off-disk bypass specifically.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

The rule is enforced by prose and a guard test, and that is honest rather than
weak: the store is a file, and any agent that can edit the repo can read it. What
makes the property hold is that **nothing tells the agent to** — and the one time
something did not tell it not to, it did.
