---
linear_issue_id: "SKS-356"
---

# Phase 3 — The skills raise the picker ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a skill that hits a blocked result relays it, then offers the fork the
engine declared — and nothing else does.

## Tasks

- [x] Write `.claude/rules/offered-unblocks.md` — the contract in one place:
      relay the refusal **first**; raise the picker only where `offer` is
      present; two options and no more (the label, and Cancel); on `satisfy` run
      the command and retry; on `bypass` run the disarm and proceed; on Cancel
      stop and record nothing.
- [x] The rule states the three properties decision 3 rests on — the operator
      answers, the choice is recorded, it is offered once — and names the
      rejected `--force` so the next reader does not re-propose it.
- [x] `/spec-diff` §2b acts on a declared offer when `live take` refuses, in
      place of its current relay-and-stop.
- [x] The commit path that meets an armed gate offers the bypass once, after
      relaying the hook's refusal.
- [x] **Never phrase a bypass as the easy path.** The label is the engine's, and
      the picker shows it verbatim.
- [x] `init`/`update` install the new rule (discovered from `assets/rules/`);
      it is referenced from `spec-planning.md` beside `/allow-main`.
      **Not beside `/spec-skip`**: that ships on `bug/live-press-does-nothing`,
      which is committed and not landed, so naming it here failed the prose
      guard that every `/spec-…` an asset names must actually ship.
- [x] Sync into the shipping packages.
- [x] Tests: the rule ships and is installed; `/spec-diff` names the offer path;
      the commands (`spec-connect`, `spec-live`, `spec-remote-review`) still say
      *"Add nothing and run nothing else"* and still carry their narrow
      `allowed-tools` — the assertion that this spec left them alone.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

**Relay first, then offer.** Not the other way round, and not instead. A picker
that replaced the refusal would hide what was wrong behind a choice about what to
do next — and the refusal text is where every exit is named, including the two
this picker does not offer.

**One picker, two options.** No third "remind me later", no default selection
that reads as a recommendation. A bypass that arrives pre-selected is a bypass by
default wearing a question mark.
