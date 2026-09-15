---
linear_issue_id: "SKS-253"
---

# Phase 5 — Configure trusted publishers and prove it end-to-end ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** both packages are released through the pipeline for real, and the
published versions are confirmed on the registry with provenance naming the
expected commit.

## Tasks

- [ ] **Operator step — tell Reuben to do this, do not attempt it.** On the
      npm website, for **each** of `@skitterbyte/skitterspec` and
      `@skitterbyte/skitterspec-linear`: Settings → Trusted Publisher → GitHub
      Actions, with every field exact and case-sensitive —
      Organization `SkitterByte`, Repository `skitterspec` (bare name),
      Workflow `release.yml` (filename only), Environment **blank**.
      A lowercase org here produces `ENEEDAUTH`.
- [ ] **Ask before pushing any tag.** Confirm the go-ahead explicitly; everything
      from here is outward-facing.
- [ ] Release `skitterspec` as **19.0.0** via `release.js skitterspec major --yes`,
      then `git push --follow-tags`. The `Release-Note!:` on the version commit
      announces the Node 22.13 floor as a breaking change.
- [ ] Watch the run, then approve with `npm run approve skitterspec 19.0.0`.
- [ ] Verify it actually published — a green workflow is only a staged build:
      `npm view @skitterbyte/skitterspec dist-tags` shows 19.0.0 as latest, and
      `npm view @skitterbyte/skitterspec@19.0.0 dist.attestations` exists and
      records the expected source commit.
- [ ] Confirm the corrected `repository.url` is what the registry now holds.
- [ ] Repeat the release, approve and verification for `skitterspec-linear` as
      **13.0.0**.
- [ ] Record in the spec Changelog what the real run taught — in particular
      whether `--provenance` was needed explicitly, and the actual JSON shape
      `npm stage list` returned.
- [ ] Run the project's test command — green before the phase is done.

## Notes

Release `skitterspec` first: it is the smaller composition
(`packages/common` + its own dist), so a pipeline fault surfaces against the
simpler tarball before `skitterspec-linear`, which composes four source packages.

If staging fails after the tag is pushed, the tag is recoverable — delete it
locally and on the remote, fix, re-push. No version is consumed on npm until an
approval, which is the whole reason decision 1 was safe to take.
