---
github_issue_id: "#48"
---

# Phase 2 — Backfill missing releases for pushed tags ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** reconcile also creates the GitHub release for a pushed tag that has
none (the >3-tags-in-one-push gap), bounded so history never floods the
releases page — then the phase-1 probe takes it from there in the same run.

## Tasks

- [ ] Enumerate candidate tags per series (`git tag --list '<tagPrefix>*'` via
      the kit's `gitReader`) and diff against the marked releases from
      `releaseList()`. Bound per Decision 8: releases exist → only tags
      semver-newer than the newest release; none exist → the newest tag only.
      Name the bound's blind spot in a comment (old unmirrored tags are
      deliberately left as history).
- [ ] For each missing tag inside the bound, run the existing `create` path
      with the series' first env as stage (same as release.yml's
      `--stage staged`), honouring `--apply`/dry-run, then feed it through the
      phase-1 move logic in the same pass.
- [ ] Refuse a shallow clone exactly as `create` does (the range walk needs
      full history) — reuse `resolveRange`'s check rather than duplicating it.
- [ ] Tests in `packages/provider-kit/test/releases.test.js`: backfills a
      missing newer tag; leaves older unmirrored tags alone (stays-silent);
      series with no releases backfills only the newest tag; a backfilled tag
      whose version is already live moves to the final env in the same run.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

- `releaseTagExists` is not needed here: the tag comes from local `git tag`,
  and reconcile runs in a full checkout (CI: `fetch-depth: 0`), so the
  create-from-default-branch hazard the op guards against cannot arise — but
  the push-the-tag-first refusal still applies if the remote lacks it.
