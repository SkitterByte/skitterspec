---
linear_issue_id: "SKS-355"
---

# Phase 2 — The gate remembers it offered ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a bypass offer is spent by being made, so the same arming cannot
produce a second one.

## Tasks

- [ ] Add `offeredAt` to the gate sidecar, written when the engine declares a
      bypass offer.
- [ ] `gateState` declares no bypass offer when `offeredAt` is already set for
      the current arming. The gate itself is unchanged — it still refuses; what
      is withheld is the *offer*, not the refusal.
- [ ] Arming clears `offeredAt`, so the next phase that ends gets its own offer.
- [ ] `GATE_VERSION` stays where it is: the field is additive and the sidecar is
      gitignored, so there is no fleet to migrate. A gate written before this
      ships reads as never-offered, which is the correct and harmless default.
- [ ] Tests: an armed gate offers once; the second read of the same arming
      offers nothing and still refuses; re-arming offers again; a sidecar with
      no `offeredAt` offers.
- [ ] Sync into the shipping packages.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

**Withholding the offer must not weaken the refusal**, and the test above is
there because the easy implementation gets this backwards. A second refused
commit is still refused; the operator simply gets the bare refusal and its named
exits, exactly as they do today.

**The unreadable sidecar keeps routing to inaction** — `readGate` already
reports `corrupt` rather than reading as armed, and a gate we cannot parse must
now also not produce an offer. Both cannot-tells go the harmless way
(`.claude/rules/negative-checks.md` rule 4).
