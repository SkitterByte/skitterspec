# Phase 2 — Detect the rename and print the plan (read-only) ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec spec-sync retarget` reports whether the team key moved and
exactly what would change, touching nothing.

## Tasks

- [x] Add `key` to the existing `team(id:)` GraphQL query in
      `packages/linear/src/api.js`, and expose `readTeam(teamId)` on the adapter.
      *(Shipped in 10.4.0, API-side only — `api.test.js` covers it.)*
- [ ] Add the `retarget` case to `cli-sync.js`: resolve the recorded key via
      `deriveRecordedKey`, fetch Linear's current key, and short-circuit with a
      clean "already current" message when they match. **Rename the shipped `doctor` case rather than adding a second verb**
      — `doctor` must be free for `feat-setup-doctor`. Remove the per-ref
      existence sweep (decision 11) and the MCP refusal it forced.
- [ ] Spot-check before reporting: resolve the first remapped identifier and
      compare its title against that spec's — report `resolves, title matches`,
      or refuse with what was found instead.
- [ ] Print the plan in the shape agreed in the overview: recorded vs live key,
      counts per category, the spot-check line, and the `--yes` hint.
- [ ] Handle the MCP path, where `get_team` does not return the key: say so and
      ask the operator to confirm, rather than guessing or silently skipping.
      Viable only because decision 11 cuts this to one read — 10.4.0 refused over
      MCP precisely because its sweep was one read per ref.
- [ ] Refuse with a clear message when `teamId` is unset, or when
      `deriveRecordedKey` reports ambiguous stamps.
- [ ] Add `packages/linear/test/cli-retarget.test.js` with a stubbed adapter:
      match → no-op; mismatch → plan with correct counts; spot-check failure →
      refusal; missing `teamId` → refusal. Assert **nothing on disk changed** in
      every case. Rename `cli-doctor.test.js` into it — match/mismatch/missing-
      `teamId`/nothing-changed already exist; the spot-check cases are new, and
      the archived-refs test goes away with the sweep.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

Read-only is the whole point of this phase: it is safe to run against a real repo
before phase 3 exists, which is also how the plan output gets validated against
the two rewrites already done by hand.
