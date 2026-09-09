---
linear_issue_id: "SKS-94"
---

# Phase 2 — Authoring skills ask and emit the header ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** with gating configured, a spec written by `/spec`, `/spec-bug` or
`/spec-hotfix` always carries a `Gating:` header, and the skill asked before
writing it; with gating absent, the output is unchanged.

## Tasks

- [ ] `assets/skills/spec/SKILL.md`: add a Phase A grill item beside item 9
      (isolation stack), gated *(only when `specs/.core/gating.config.json`
      exists)* — should this ship behind a feature flag, or land live? **Offer, do
      not impose**; cite `guidance` when set; record the answer either way.
- [ ] `assets/skills/spec/SKILL.md`: add `> **Gating:**` to the header template
      directly under `> **Stack:**`, with the flag-name-or-`none: <reason>` grammar
      and a note that an empty value is not a valid outcome.
- [ ] Extend the skill's existing "record the isolation stack" finish-up phase to
      also confirm the `Gating:` header matches the grill answer, or add a sibling
      phase — whichever reads better once in the file.
- [ ] `assets/skills/spec-bug/SKILL.md`: same grill item and header line — a bug
      fix ships in the next release like a feature.
- [ ] `assets/skills/spec-hotfix/SKILL.md`: pre-fill
      `none: hotfix — restoring released behaviour`, ask only to confirm, and emit
      the same header. Say why the default differs.
- [ ] `assets/rules/spec-planning.md`: document the `Gating:` header in the header
      fields section and the config gate alongside the isolation and provider gates.
      This is the canonical reference the skills point at.
- [ ] Keep every edit inside `packages/common/assets/` — `packages/skitterspec*/assets/`
      is composed and gitignored, so editing it would be lost and duplicated.
- [ ] Honour `.claude/rules/spec-planning.md`'s markdown rule: never let a `**bold**`
      span or a link cross a hard line break.
- [ ] Extend `packages/common/test/assets.test.js` (or a sibling) to assert each of
      the three authoring skills carries the `Gating:` template line, states the
      config gate, and phrases the question as an offer.
- [ ] Run `node --test` and `node scripts/build-dist.js all` — green before the
      phase is done.
