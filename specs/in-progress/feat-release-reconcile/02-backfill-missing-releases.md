---
github_issue_id: "#48"
---

# Phase 2 — Backfill missing releases for pushed tags ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** reconcile also creates the GitHub release for a pushed tag that has
none (the >3-tags-in-one-push gap), bounded so history never floods the
releases page — then the phase-1 probe takes it from there in the same run.

## Tasks

- [x] Enumerate candidate tags per series (`git tag --list '<tagPrefix>*'` via
      the kit's `gitReader`) and diff against ALL releases from `releaseList()`
      (not just marked ones, so a hand-made release's tag is never a backfill
      candidate). Bound per Decision 8: releases exist → only tags
      semver-newer than the newest marked release; none exist → the newest tag
      only. The bound's blind spot is named in a comment (old unmirrored tags
      are deliberately left as history).
- [x] For each missing tag inside the bound: the `releaseTagExists` guard,
      create at the series' first env (marker + Deployed field, matching
      release.yml's `create --stage staged` + `deployed staged`), honouring
      `--apply`/dry-run, then through the phase-1 move logic in the same pass.
- [x] Refuse a shallow clone up front with `create`'s wording — one refusal for
      the run rather than a skip line per tag.
- [x] Tests in `packages/github/test/release.test.js` (the end-to-end harness,
      per the phase-1 re-split): backfills missing newer tags and moves live
      ones in the same pass; a created-but-not-live tag stays at the first env;
      leaves older unmirrored tags alone (stays-silent); a series with no
      releases backfills only its newest tag; dry run writes nothing; a tag the
      remote lacks is skipped alone; a shallow clone refuses.
- [x] Run `pnpm test` — 4201 pass.

## Notes

- `releaseTagExists` is not needed here: the tag comes from local `git tag`,
  and reconcile runs in a full checkout (CI: `fetch-depth: 0`), so the
  create-from-default-branch hazard the op guards against cannot arise — but
  the push-the-tag-first refusal still applies if the remote lacks it.
