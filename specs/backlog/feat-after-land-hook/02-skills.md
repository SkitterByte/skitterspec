---
linear_issue_id: "SKS-393"
---

# Phase 2 — Skills run it and report it ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the three code-landing skills run the printed after-land commands and
report them per Decisions 6–8; `/spec` skips them. Proven by asset tests.

## Tasks

- [ ] `/spec-complete` 6-feature/bug and 6-hotfix: after the land succeeds (and
      on an already-landed no-op), run the after-land section in its cwd; stop
      on the first failure; `⚠️` naming the failed command; never undo the land,
      never skip step 7 teardown over it
- [ ] `/spec-to-main` §4–5: same, after the ff and before the re-test on base
- [ ] `/no-spec` land: same
- [ ] `/spec` C2 land: say explicitly that the after-land section is not run
      for a documents-only land
- [ ] Each skill's `## Report`: what ran goes in `Notes`; failure is `⚠️`
- [ ] Asset test asserting the four skills say the above (follow the existing
      `assets-*.test.js` pattern)
- [ ] Run the project's typecheck and test commands — green before the phase is
      done

## Notes

Once released, ereqs sets `"afterLand": ["pnpm db:data-migration"]`, drops its
deviation paragraphs, and runs `skitterspec update` to un-customize both skills —
their acceptance, not a task here.
