---
github_issue_id: "#52"
---

# Phase 2 — Deployed field on stage ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `release deployed <env> --apply` sets `releases.deployedField` on each
attached spec story to that env's configured value, after validating it, and
leaves the story's State alone. Proven by adapter tests.

## Tasks

- [x] Add `releases.deployedField` (default `""`) to `config.js`, and pass it
      into `makeApiAdapter`
- [x] Add `fieldAllowedValues(workItemType, fieldRef)` to the API adapter
      (`wit/workitemtypes/{type}/fields/{ref}?$expand=allowedValues`). A 404,
      or a field missing from the type, is a named refusal
- [x] In `releaseStage`, when `deployedField` is set: batch-read the tickets'
      types and current field value; validate `stateName` against each distinct
      type's allowed values before any write; then patch only the tickets whose
      value differs. `set` = 1 + changed
- [x] Make sure the field write never includes `System.State`
- [x] Document `releases.deployedField` in `azure-boards.config.md`, and the
      process steps in `SETUP.md`: add a picklist on User Story/Bug holding the
      `envs` values, show it on the card, add a card style rule per value, and
      put the Release type on its own backlog level for a release board
- [x] Tests: sets the field on stories, skips ones already at the value, an
      unknown value refuses with nothing written, a type without the field
      refuses with nothing written, empty `deployedField` writes nothing beyond
      today's release-item move (stays silent). Run `pnpm -r typecheck` (where
      defined) and `pnpm --filter ./packages/azure-boards test` — green

## Notes

Picklist values are case-sensitive on write. Validate exactly, and include the
allowed list in the refusal so a near-miss like `on demo` vs `On Demo` is
obvious.
