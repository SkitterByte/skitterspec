---
linear_issue_id: "SKS-354"
---

# Phase 1 — The engine declares an offer ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a blocked result can carry `offer`, two refusals declare one, and every
other refusal is provably unchanged.

## Tasks

- [ ] Add `offer` to the blocked shape in `packages/common/src/env/live.js` —
      `{ kind: 'satisfy' | 'bypass', label, command }`, set through `block()` so
      there is one place that can produce one.
- [ ] Declare it on **one** of `planTake`'s refusals: the spec's own worktree
      being dirty (check 3b). `kind: 'satisfy'`, label `Commit first, then go
      live`, command `/commit`.
- [ ] Declare it on the armed gate (`gateState` / `specEnvReviewGate`):
      `kind: 'bypass'`, label `Commit without reading the diff — recorded as
      such`, command the disarm from decision 7.
- [ ] `--json` carries `offer` on both, and **only** when there is one — spread
      conditionally, as `buttons` and `reviewers` already are.
- [ ] The text output names the offer beneath the reason, so a reader in a plain
      terminal sees the same thing the picker would have shown them.
- [ ] Sync into the shipping packages (`npm run build` — they are generated).
- [ ] Tests, including the stays-silent half: every other `planTake` refusal
      carries **no** `offer` — in particular the one where another spec holds the
      workbench (decision 6), the hotfix, the stateful spec and the migrations
      branch, which are redirections rather than unblocks.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

**`offer` is data, and this phase changes no behaviour.** Nothing reads it yet.
That is deliberate: it makes phase 1 independently shippable and makes the
stays-silent tests meaningful before anything can act on a false positive.

**The primary checkout being dirty is NOT offered** (`planTake` check 2), even
though it looks like the same case as 3b. The dirty tree there is whatever the
operator happens to have in their main checkout — not this spec's phase work —
and committing it under this spec's ticket is the mis-stamping
`commit-trailers.md` exists to prevent.
