---
linear_issue_id: "SKS-369"
---

# Phase 2 — Point the four waiting skills at the preference ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every skill that waits names the persistent-primitive preference in
its wait step and still defers the contract to spec-reports.md.

## Tasks

- [ ] `/spec-next` §5 step 2: "run the engine's wait in the background" →
      run it under the harness's persistent watch primitive where one exists,
      else in the background; contract unchanged, still deferred.
- [ ] `/spec` Phase C2 "Then wait for it": same sentence, same deference.
- [ ] `/spec-bug` 5b and `/no-spec`: confirm they delegate to `/spec-next`
      §5 / the rule; update any restated sentence rather than adding a copy.
- [ ] Update the asset-pinning tests that hold the skills' wait sentences.
- [ ] Run `skitterspec update` in this repo (accept managed changes) so the
      installed `.claude/` copies match the assets; commit what it re-syncs.
- [ ] Run `node --test` — green before the phase is done.

## Notes

Keep the four texts pointing at one contract — the phase is wording, not new
mechanism, and must not fork the rule.
