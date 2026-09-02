# Phase 3 — Audit init and the doctor rows ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the install classifier and every remaining `doctor` row are proven not
to accuse a healthy project, closing the class the scaffold bug came from.

## Tasks

- [x] `managedState` / resync (`init.js:148`) — assert the unknown-hash case
      keeps the file (it is the rule's own example, so it must be covered): a
      project installed before manifests existed must resync without clobbering
      a user's edits.
- [x] Assert `init`'s existing-setup detection does not read a *fresh* repo as
      half-installed, nor a fully-installed one as fresh.
- [x] Re-check each remaining `doctor` row against the rule — isolation, tracker,
      key, remote — and add a stays-silent test wherever the row could fire on a
      healthy project. The scaffold row is already covered by
      `bug-scaffold-empty-buckets`.
- [x] Specifically: confirm the `key` row cannot report `missing` when a key is
      resolvable by a `keyCommand`, and that the `remote` row never reports
      `broken` for a transport problem that is not the user's setup.
- [x] Add the blind-spot comment to each row that gained a test.
- [x] Run `pnpm test` — green before the phase is done.

## Notes

`doctor` is the highest-stakes of these: it exits non-zero and skills branch on
that, so a false `broken` fails other people's automation rather than merely
printing a wrong line. It is also brand new, which is exactly when its checks are
least exercised.

## Outcome

Two rows accused wrongly, both in `doctor` — the highest-stakes check, as the
notes predicted.

1. **The `remote` row called a transport failure `broken`**, so a laptop off the
   network exited 1 and failed every skill branching on the code. An unreachable
   or rate-limited API never answered, which says nothing about whether the
   project is set up — `classifyRemoteFailure` now marks those `reached: false`
   and the row reports `skipped`, still printing what happened. An *answered*
   refusal (a rejected key, a team that does not resolve) is still `broken`,
   including the unrecognised case: Linear answered and refused, which is
   evidence even when we cannot name it.
2. **The `key` row discarded the reason a key failed to resolve.** A `keyCommand`
   that exists but fails was reported as `no key for SKS`, sending the user to
   set a key they had already set — the exact misreport `credentials status`
   avoids on purpose. The reason is now carried onto the row.

`isolation` and `tracker` have no false-positive mode: each says `broken` only on
positive evidence (a file present that does not parse, a config with no
`teamId`). That is recorded in a comment rather than a hollow test, per the rule.

On the `init` side, `managedState` needed no change — the pre-manifest case is
the rule's own example and now has the test it lacked, plus its counterweight
(an untouched file is still `pristine` with no manifest at all).
