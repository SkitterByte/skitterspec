---
linear_issue_id: "SKS-259"
---

# Phase 2 — Release and verify `skitterspec` 19.0.0 ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `@skitterbyte/skitterspec@19.0.0` is live on the registry, published by
CI, carrying a provenance attestation that names the commit it was built from.

## Tasks

- [x] **Operator step — tell Reuben, do not attempt it.** Configure a trusted
      publisher for `@skitterbyte/skitterspec` on the npm registry's website:
      Settings → Trusted Publisher → GitHub Actions. Every field is exact and
      case-sensitive — Organization `SkitterByte`, Repository `skitterspec` (the
      bare name), Workflow `release.yml` (the filename only), Environment blank.
      A lowercase org here is what produces `ENEEDAUTH`.
- [x] Verify the plan first, changing nothing:
      `node scripts/release.js skitterspec major`. It should read `18.0.0 →
      19.0.0`, carry no publish step, and print `npm run approve` in the
      follow-up.
- [x] **Ask before cutting the tag.** Then run
      `node scripts/release.js skitterspec major --yes` and check the generated
      `RELEASES-skitterspec.md` actually picked up the breaking-change note about
      the Node floor.
- [x] **Ask before pushing.** Then `git push --follow-tags`, and watch the
      `release.yml` run.
- [x] Read the run's diagnostic step. Confirm npm was upgraded past 11.15.0 and
      that the log mentions the OIDC exchange. A `Signed provenance statement`
      line followed by a 403 or 404 is **not** a signing failure — it means the
      trusted-publisher config is wrong.
- [x] Approve it: `npm run approve skitterspec 19.0.0`. This prompts for 2FA and
      needs an authenticated session; an `E401` from the listing means not logged
      in, not a failed release.
- [x] **Verify it actually published — a green workflow is only a staged build.**
      `npm view @skitterbyte/skitterspec dist-tags` must show 19.0.0 as latest,
      and `npm view @skitterbyte/skitterspec@19.0.0 dist.attestations` must exist
      and record the expected source commit. Neither package carried any
      attestation before this pipeline.
- [x] Confirm the tarball is not empty — `npm view @skitterbyte/skitterspec@19.0.0
      dist.unpackedSize` against 18.0.0's. The dist `bin`/`src`/`assets` are
      gitignored and composed at pack time, so an empty tarball is the failure
      mode to rule out.
- [x] Record in the Changelog whether `--provenance` turned out to be needed
      explicitly, and the actual JSON shape `npm stage list` returned — both were
      written from the sibling repo's experience rather than observed here.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

If staging fails after the tag is pushed, the tag is recoverable: delete it
locally and on the remote, fix, re-push. Nothing is consumed on the registry
until an approval. If a staged build should not ship, discard it with
`npm run approve skitterspec --reject`.

Use the workflow's `workflow_dispatch` trigger to re-run against an existing tag
rather than cutting a second one.

## What the first real run settled

**`--provenance` is not needed.** The workflow does not pass it, and the
published version carries both a `publish/v0.1` attestation and a
`slsa.dev/provenance/v1` one. Provenance is implicit once npm sees the OIDC
token, exactly as the comment in `release.yml` guessed. That comment can now be
read as fact rather than as a thing to confirm.

**The provenance names the right things**, which is the whole point of it:

```
subject:    pkg:npm/%40skitterbyte/skitterspec@19.0.0
workflow:   .github/workflows/release.yml
repository: https://github.com/SkitterByte/skitterspec
ref:        refs/tags/skitterspec@19.0.0
commit:     489353ff1475c4514c8f329e7fd3c027f2463a8e
```

That commit is the one `skitterspec@19.0.0` points at, and the repository is in
the org's real case — the correction from `bug`-era lowercase that would
otherwise have failed the sigstore validation at the last step.

**`npm stage list --json` parsed on the first try.** `approve-release.cjs`
resolved `19.0.0` to `d62e9ebb-298e-47e3-b37d-bd168cba5589` against the real
payload, so the defensive parser adapted from the sibling repo is confirmed
against this registry rather than assumed.

**The approve needs a real terminal.** Run with captured stdio it fails `EOTP`
before npm's browser handshake can start; the stage is untouched by that, so it
is a retry rather than a loss. The helper reports the failure but does not name
the cause — worth improving.

**The tarball was inspected before approving, not after.** 51 files against
18.0.0's 45, with `bin`, `src` (24), `assets` (23) and `MIGRATION.md` all
present, `version` 19.0.0 and `engines.node` `>=22.13` inside it. Approving is
irreversible, so an empty-tarball check afterwards would have been a post-mortem.
