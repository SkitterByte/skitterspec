---
linear_issue_id: "SKS-402"
---

# Phase 1 — Tag order, bump strategies, hotfix-suffixed bases ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** pure functions that pick the next hotfix tag the way skittership does, proven by
unit tests with no git.

## Tasks

- [x] Add `compareTags(a, b)` to `src/env/hotfix.js`:
  - order `X.Y.Z-rc.N < X.Y.Z < X.Y.Z-hotfix.N < X.Y.(Z+1)`;
  - compare N numerically;
  - comment the rule and its match with skittership and `version:refname`.
- [x] Add `nextHotfixTag(baseTag, existingTags)`:
  - the root is the base with any `-hotfix.N` stripped;
  - the result is `<root>-hotfix.<max N + 1>`;
  - the prefix (`v` or none) is preserved.
- [x] Add `nextTag(baseTag, existingTags, bump)`, dispatching `patch` (`bumpPatch`,
  unchanged) or `hotfix-suffix`.
- [x] Make `planHotfixLand` use `nextTag` for both the prod tag and the extra targets.
- [x] Validate `hotfix.bump` in `src/env/config.js`: an unknown value is a config error
  naming the allowed set.
- [x] Check `up --from` and `readBaseVersionField` accept `vX.Y.Z-hotfix.N`; fix and test
  any regex that doesn't.
- [x] Tests:
  - `v37.2.0` → `-hotfix.1`;
  - with `.1` and `.2` present → `-hotfix.3`;
  - `v36.4.0-hotfix.2` → `-hotfix.3`;
  - not blocked by an existing `v37.2.1`;
  - comparator ordering, including `-rc.1`;
  - an unknown bump is refused;
  - **stays silent:** the default config (`bump: 'patch'`, no `releaseWith`) plans
    exactly today's prod tag and commands.
- [x] Run `pnpm test`; green before the phase is done.
