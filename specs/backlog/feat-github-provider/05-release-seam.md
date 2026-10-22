---
linear_issue_id: "SKS-413"
---

# Phase 5 — Release seam + GitHub releases ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-sync release create|deployed|complete` exist as a
provider-neutral seam with GitHub as its first implementation — proven by
mock tests and a dry-run against this repo's own tag history.

## Tasks

- [ ] Kit: the three verbs, dry-run unless `--apply`, `--json`; range = previous
      tag in the same series (`git describe --match '<prefix>*' <tag>^`);
      ticket set = `movable` + `unfinished`, `foreign`/`unlinked` reported;
      shallow-history refusal naming `fetch-depth: 0`
      (`feat-tracker-releases` Decisions 1–7).
- [ ] Optional adapter ops `releaseFind`, `releaseCreate`, `releaseAttach`,
      `releaseStage`, `releaseComplete`, feature-detected; a provider without
      them refuses in one line.
- [ ] GitHub impl: find the Release by tag (lookup failure = cannot tell →
      refuse, never create); create/update its body with notes + ticket list;
      one comment per attached issue (idempotent by marker); `deployed` sets
      the board's `Deployed` option per attached issue, validated against the
      field; `complete` clears prerelease. A backwards stage warns, never
      refuses.
- [ ] Config `releases.{deployedField, series[]}` + doctor checks (field and
      env options exist).
- [ ] Re-scope `specs/backlog/feat-tracker-releases`: Decisions 3/8 now point at
      this seam, phases cut to the Linear adapter ops, Changelog entry.
- [ ] Tests: idempotent re-run on the same tag, first release with no previous
      tag, hotfix tag ranging from its base, foreign refs excluded. Full
      workspace suite green.
