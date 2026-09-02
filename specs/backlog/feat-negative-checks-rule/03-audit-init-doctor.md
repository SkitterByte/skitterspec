# Phase 3 — Audit init and the doctor rows ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the install classifier and every remaining `doctor` row are proven not
to accuse a healthy project, closing the class the scaffold bug came from.

## Tasks

- [ ] `managedState` / resync (`init.js:148`) — assert the unknown-hash case
      keeps the file (it is the rule's own example, so it must be covered): a
      project installed before manifests existed must resync without clobbering
      a user's edits.
- [ ] Assert `init`'s existing-setup detection does not read a *fresh* repo as
      half-installed, nor a fully-installed one as fresh.
- [ ] Re-check each remaining `doctor` row against the rule — isolation, tracker,
      key, remote — and add a stays-silent test wherever the row could fire on a
      healthy project. The scaffold row is already covered by
      `bug-scaffold-empty-buckets`.
- [ ] Specifically: confirm the `key` row cannot report `missing` when a key is
      resolvable by a `keyCommand`, and that the `remote` row never reports
      `broken` for a transport problem that is not the user's setup.
- [ ] Add the blind-spot comment to each row that gained a test.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

`doctor` is the highest-stakes of these: it exits non-zero and skills branch on
that, so a false `broken` fails other people's automation rather than merely
printing a wrong line. It is also brand new, which is exactly when its checks are
least exercised.
