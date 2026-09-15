---
linear_identifier: "SKS-257"
linear_url: "https://linear.app/skitterbyte/issue/SKS-257/prove-the-staged-publish-pipeline"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Prove the staged publish pipeline

> **Type:** Feature
> **Name:** feat-prove-staged-publish (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-15)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-15
> **Area:** packages/skitterspec/package.json, packages/skitterspec-linear/package.json, RELEASES-skitterspec.md, RELEASES-skitterspec-linear.md
> **Stack:** worktree

## Problem

`feat-staged-publish-pipeline` built the whole release path — `ci.yml`,
`release.yml`, the approve helper, the metadata guards — and none of it has ever
run. The remote has never seen a workflow file, no trusted publisher exists, and
neither published package carries a provenance attestation. A pipeline that has
not published anything is a hypothesis, and the six failed publishes that
preceded it in the sibling repo are the argument for not treating it as more
than that. This spec is the run that settles it.

## Decisions

1. **This is a separate spec because the release needs a landed `main`.** The
   pipeline spec is what produced that, so the proving run could not happen
   inside it — the remote was 158 commits behind with no `.github/` at all.
2. **Push and watch CI before touching a tag.** `ci.yml` has never executed, and
   a failure there is cheap; a failure after a tag push costs a tag and a
   re-push. Rejected going straight to a release on the grounds that the
   workflows are test-guarded — those guards assert the file's text, not that
   GitHub accepts it.
3. **`skitterspec` first, `skitterspec-linear` second.** The base is the smaller
   composition (`packages/common` plus its own dist), so a packing fault surfaces
   against the simpler tarball. The provider composes four source packages.
4. **A green workflow does not end a phase.** Staging is not publishing, so each
   release phase ends on `npm view` confirming the `dist-tags` moved **and** that
   `dist.attestations` exists and names the expected commit. Both packages have
   no attestation today, which is what makes its presence proof rather than
   decoration.
5. **Nothing here is undone by a failure.** A tag whose staging failed is
   deleted and re-pushed; a staged build that should not ship is rejected with
   `npm run approve <package> --reject`. No version is consumed on npm until an
   approval, which is what made the tag-triggered design safe to adopt.

## Solution overview

```
push main                    ci.yml runs for the first time
[operator] trusted publishers for both packages
release.js skitterspec major --yes   →  18.0.0 → 19.0.0
git push --follow-tags       release.yml stages it by OIDC
npm run approve skitterspec 19.0.0   →  2FA, then live
npm view … dist-tags / dist.attestations
                             then the same for skitterspec-linear 12 → 13
```

Both releases are **major** because `engines.node` rose from `>=18` to `>=22.13`,
which is breaking for consumers. The `Release-Note!:` announcing it already sits
on the commit that raised the floor, which is where `release-notes.js` scans.

The trusted-publisher fields are exact and case-sensitive — they are recorded in
`specs/complete/feat-staged-publish-pipeline/05-prove-it.md`, and a lowercase org
is what produces `ENEEDAUTH`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Release | add | `skitterspec@19.0.0` (breaking: Node floor) |
| Release | add | `skitterspec-linear@13.0.0` (breaking: Node floor) |
| Config key | update | `version` in both published manifests |
| Docs | update | `RELEASES-skitterspec.md`, `RELEASES-skitterspec-linear.md` (generated) |
| External | add | a trusted publisher per package, on the npm registry |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Push `main` and prove CI runs | ✅ | [01-first-ci-run.md](01-first-ci-run.md) |
| 2 | Release and verify `skitterspec` 19.0.0 | ✅ | [02-release-base.md](02-release-base.md) |
| 3 | Release and verify `skitterspec-linear` 13.0.0 | 🔄 | [03-release-provider.md](03-release-provider.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-15 | Ready | backlog | Reuben Greaves |
| 2026-09-15 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-15 — Spec created, carved out of `feat-staged-publish-pipeline` phase 5.
- 2026-09-15 — Phase 1: took three runs. The first two were red on two
  separate platform bugs that only a Linux runner could expose — both fixed and
  landed as their own specs. This is the value the phase was written for.
- 2026-09-15 — Phase 2: `@skitterbyte/skitterspec@19.0.0` published by CI on
  Trusted Publishing, with provenance naming commit 489353f. First release from
  this repo that carries an attestation at all.

