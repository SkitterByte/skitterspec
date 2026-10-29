---
github_issue_id: "#65"
---

# Phase 2 — Dogfood script, then remove release objects ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** this repo's board keeps its Deployed field through a consumer-side
script, and the `release` verbs and their seam are gone from every provider.

## Tasks

- [x] Add `scripts/mirror-deployed.cjs <tag> <value>`: compute the range from
      the previous tag in the same series, run `released --json`, and set
      Deployed on each `#N` ticket's board item over GraphQL; `--reconcile`
      marks each package's newest live-on-npm tag Published
- [x] Swap `release.yml`'s "Mirror the release on GitHub" step to the script;
      keep it never-fatal and keep the no-token skip
- [x] Point `approve-release.cjs` (Published) and `reconcile-releases.yml`
      (`--reconcile`) at the script
- [x] Remove `makeReleaseCommands` / `releases.js` from provider-kit and the
      `release` case in GitHub and Azure `cli-sync.js`
- [x] Remove the release adapter ops (`releaseFind/Create/Attach/Stage/Complete`)
      and their API calls (GitHub Releases, Deployed field writes, Azure)
- [x] `release` refuses: exit 1, one line naming `released --json`
- [x] Drop `releases.series` / `deployedField` from config defaults; `doctor`
      lists them as unused when present, exit unchanged
- [x] Delete `releases.test.js`, `github/test/release.test.js`; add a refusal
      test and a doctor stays-silent test (config without the keys)
- [x] Run typecheck + tests — green

## Notes

The script is this repo's code, not shipped: it is what a consumer would
write, and it proves `released --json` is enough to write it.
