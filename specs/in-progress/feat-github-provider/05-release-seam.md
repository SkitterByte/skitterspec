---
linear_issue_id: "SKS-413"
github_issue_id: "#6"
---

# Phase 5 — Release seam + GitHub releases ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `spec-sync release create|deployed|complete` exist as a
provider-neutral seam with GitHub as its first implementation — proven by
mock tests and a dry-run against this repo's own tag history.

## Tasks

- [x] Kit: the three verbs, dry-run unless `--apply`, `--json`; range = previous
      tag in the same series (`git describe --match '<prefix>*' <tag>^`);
      ticket set = `movable` + `unfinished`, `foreign`/`unlinked` reported;
      shallow-history refusal naming `fetch-depth: 0`
      (`feat-tracker-releases` Decisions 1–7).
- [x] Optional adapter ops `releaseFind`, `releaseCreate`, `releaseAttach`,
      `releaseStage`, `releaseComplete`, feature-detected; a provider without
      them refuses in one line.
- [x] GitHub impl: find the Release by tag (lookup failure = cannot tell →
      refuse, never create); create/update its body with notes + ticket list;
      one comment per attached issue (idempotent by marker); `deployed` sets
      the board's `Deployed` option per attached issue, validated against the
      field; `complete` clears prerelease. A backwards stage warns, never
      refuses.
- [x] Config `releases.{deployedField, series[]}` + doctor checks (field and
      env options exist).
- [x] Re-scope `specs/backlog/feat-tracker-releases`: Decisions 3/8 now point at
      this seam, phases cut to the Linear adapter ops, Changelog entry.
- [x] Tests: idempotent re-run on the same tag, first release with no previous
      tag, hotfix tag ranging from its base, foreign refs excluded. Full
      workspace suite green.

## Notes (built)

- **Kit:** `provider-kit/src/releases.js` — `makeReleaseCommands` (the three
  verbs), `resolveRange` (shallow-clone refusal first, then a missing tag, then
  `describe --match '<prefix>*' <tag>^`), `composeBody`, and the stage marker
  (`<!-- skitterspec:release v1 stage=… -->`) that lets `deployed` warn on a
  backwards move without reading every issue.
- **Deviation:** `deployed` and `complete` take the TAG, not a bare version —
  with several series in one repo a version is ambiguous. A bare version is
  still accepted when exactly one series is configured.
- **Ops added to the seam:** `releaseUpdate` (create's update half) and an
  optional `releaseTagExists`, because GitHub handed a missing `tag_name`
  CREATES the tag at the default branch's head. `false` refuses; a cannot-tell
  proceeds.
- **GitHub impl:** a staged release is a prerelease with `make_latest: false`;
  `complete` clears both. One comment per attached issue, idempotent by
  marker. `deployed` sets the board's `releases.deployedField` option per
  issue, resolving the option before the first write.
- A `create` re-run after a deploy keeps the stage the release reached.
- Over MCP every verb exits 1: the official server has no release write tool.
- `releases.{deployedField, series[]}` validated by the loader; doctor checks
  the field and its env options only where a series is configured.
- The goal's "dry-run against this repo's own tag history" waits for phase 7:
  this repo has no `github.config.json` until the dogfood swap. The tag logic
  is exercised by the release tests on a real repo with a hotfix series.
