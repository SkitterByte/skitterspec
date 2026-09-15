---
linear_issue_id: "SKS-259"
---

# Phase 2 — Release and verify `skitterspec` 19.0.0 ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `@skitterbyte/skitterspec@19.0.0` is live on the registry, published by
CI, carrying a provenance attestation that names the commit it was built from.

## Tasks

- [ ] **Operator step — tell Reuben, do not attempt it.** Configure a trusted
      publisher for `@skitterbyte/skitterspec` on the npm registry's website:
      Settings → Trusted Publisher → GitHub Actions. Every field is exact and
      case-sensitive — Organization `SkitterByte`, Repository `skitterspec` (the
      bare name), Workflow `release.yml` (the filename only), Environment blank.
      A lowercase org here is what produces `ENEEDAUTH`.
- [ ] Verify the plan first, changing nothing:
      `node scripts/release.js skitterspec major`. It should read `18.0.0 →
      19.0.0`, carry no publish step, and print `npm run approve` in the
      follow-up.
- [ ] **Ask before cutting the tag.** Then run
      `node scripts/release.js skitterspec major --yes` and check the generated
      `RELEASES-skitterspec.md` actually picked up the breaking-change note about
      the Node floor.
- [ ] **Ask before pushing.** Then `git push --follow-tags`, and watch the
      `release.yml` run.
- [ ] Read the run's diagnostic step. Confirm npm was upgraded past 11.15.0 and
      that the log mentions the OIDC exchange. A `Signed provenance statement`
      line followed by a 403 or 404 is **not** a signing failure — it means the
      trusted-publisher config is wrong.
- [ ] Approve it: `npm run approve skitterspec 19.0.0`. This prompts for 2FA and
      needs an authenticated session; an `E401` from the listing means not logged
      in, not a failed release.
- [ ] **Verify it actually published — a green workflow is only a staged build.**
      `npm view @skitterbyte/skitterspec dist-tags` must show 19.0.0 as latest,
      and `npm view @skitterbyte/skitterspec@19.0.0 dist.attestations` must exist
      and record the expected source commit. Neither package carried any
      attestation before this pipeline.
- [ ] Confirm the tarball is not empty — `npm view @skitterbyte/skitterspec@19.0.0
      dist.unpackedSize` against 18.0.0's. The dist `bin`/`src`/`assets` are
      gitignored and composed at pack time, so an empty tarball is the failure
      mode to rule out.
- [ ] Record in the Changelog whether `--provenance` turned out to be needed
      explicitly, and the actual JSON shape `npm stage list` returned — both were
      written from the sibling repo's experience rather than observed here.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

If staging fails after the tag is pushed, the tag is recoverable: delete it
locally and on the remote, fix, re-push. Nothing is consumed on the registry
until an approval. If a staged build should not ship, discard it with
`npm run approve skitterspec --reject`.

Use the workflow's `workflow_dispatch` trigger to re-run against an existing tag
rather than cutting a second one.
