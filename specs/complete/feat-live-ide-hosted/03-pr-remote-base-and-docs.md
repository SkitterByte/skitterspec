---
github_issue_id: "#201"
---

# Phase 3 — PR-mode rebase onto remote base + migrations docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** with `land.strategy: "pr"`, `live take` tests the branch on top of
`<remote>/<base>`. EF Core projects have a documented `live.migrations` glob.

## Tasks

- [x] `specEnvLiveTake`: when the land strategy is `pr`, run
      `git fetch <remote> <base>` and pass `<remote>/<base>` as the rebase
      target. Reuse the remote resolution `integrate` already uses
- [x] A failed fetch (offline, no remote) passes local base plus a warning
      naming it. Never refuse on it. Comment the blind spot beside the check
- [x] Use the same base for the migrations/deps diff (`<base>...<branch>`), so
      both checks read the commits that will actually be replayed
- [x] Record the reversal in `specs/complete/feat-pr-landing/00-overview.md`'s
      Changelog (a dated line pointing here). Do not rewrite the original entry
- [x] `/spec-live` command text: say the base is the remote one in PR mode
- [x] Docs: `env.config.md` `live.migrations` gets an EF Core
      `**/Migrations/**` example. `docs/reference.html` covers it plus the PR
      base; bump `verified:`
- [x] Tests: PR mode plans `rebase <remote>/<base>`; fetch failure → local
      base + warning; trunk mode unchanged (stays-silent)
- [x] Run typecheck + `pnpm test` — green before the phase is done
