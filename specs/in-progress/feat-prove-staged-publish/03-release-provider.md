---
linear_issue_id: "SKS-260"
---

# Phase 3 — Release and verify `skitterspec-linear` 13.0.0 ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `@skitterbyte/skitterspec-linear@13.0.0` is live and verified the same
way, proving the pipeline handles the larger composition too.

## Tasks

- [ ] **Operator step — tell Reuben, do not attempt it.** Configure a trusted
      publisher for `@skitterbyte/skitterspec-linear`, with the same four field
      values as phase 2. It is a per-package setting, so phase 2's does not carry
      over.
- [ ] Verify the plan: `node scripts/release.js skitterspec-linear major` should
      read `12.0.0 → 13.0.0`.
- [ ] **Ask before cutting and pushing the tag.** Then release it the same way,
      and approve with `npm run approve skitterspec-linear 13.0.0`.
- [ ] Verify `dist-tags` moved and `dist.attestations` exists, as in phase 2.
- [ ] **Check the composition specifically.** This package is built from four
      source packages (`common`, `linear`, `sync-core` and its own dist), so
      unpack the published tarball and confirm the provider's own assets are in
      it — `npm pack @skitterbyte/skitterspec-linear@13.0.0` and list the
      contents. A base-only tarball would pass every other check in this spec.
- [ ] Confirm both packages now report the corrected `repository.url` on the
      registry, in the org's real case — the lowercase spelling is what would
      have failed the provenance validation.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

With both packages released the pipeline is proven end to end and there is
nothing left of the original brief outstanding. The tag scheme, the approve
helper and the guards all stay as they are; the next release is an ordinary one.
