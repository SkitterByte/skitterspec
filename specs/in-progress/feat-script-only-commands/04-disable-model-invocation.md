---
linear_issue_id: "SKS-50"
---

# Phase 4 — Take the remaining engine skills out of the listing ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-status`, `spec-sync` and `spec-to-main` stop occupying the
model-facing skill listing while keeping every bit of their behaviour — and the
saving is measured rather than assumed.

## Tasks

- [ ] Add `disable-model-invocation: true` to the frontmatter of
      `packages/linear/assets/skills/spec-status/SKILL.md`,
      `packages/linear/assets/skills/spec-sync/SKILL.md` and
      `packages/common/assets/skills/spec-to-main/SKILL.md`.
- [ ] Confirm each still works when the **user** types it — the flag restricts
      model invocation only. Exercise `/spec-status` and `/spec-to-main` end-to-end.
- [ ] Re-check references to these three from other skills (`/spec` mentions
      `/spec-status`): each must be advice to the user, not a model invocation.
- [ ] Measure the result and record it in the spec Changelog: the skill-listing
      token count before and after this spec, and the turn count for a
      `/spec-connect` invocation before (skill) and after (command). This is the
      number that justified the work.
- [ ] Update `packages/common/assets/rules/spec-planning.md` so the table reflects
      which entries are user-only.
- [ ] Add a test asserting every shipped `SKILL.md` and command file has parseable
      frontmatter and that the three named skills carry the flag — so a future
      compose or overlay change cannot silently drop it.
- [ ] Run the project's typecheck and test commands (see
      `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

`spec-status` is read-only, so the flag there is purely a token play rather than a
side-effect guard; it is included because nobody invokes it except by typing it.
If the Phase 4 measurement shows the listing cost is negligible, reverting this
phase alone is cheap and leaves Phases 1–3 intact.
