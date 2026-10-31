---
github_issue_id: "#77"
---

# Phase 2 — Authoring surfaces: propose the kind ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec` proposes feature-or-chore after grilling and records the
answer in the header and folder prefix; the rules and commit guidance know the
fourth kind.

## Tasks

- [ ] `packages/common/assets/skills/spec/SKILL.md`: after Phase A, propose
      the kind with a one-line reason ("no user-visible surface → chore"),
      user confirms/overrides; a chore spec uses the `chore-` prefix,
      `> **Type:** Chore`, and defaults `Gating:` to `none: not user-facing`
      (only when gating is configured). Template gains the Chore variant.
- [ ] `packages/common/assets/rules/spec-planning.md`: the spec-types section
      becomes four kinds (prefix, header value, which skill writes each); note
      `/spec` proposes between Feature and Chore.
- [ ] Commit guidance: on a chore spec the default commit type is
      `chore`/`refactor`/`ci` with no `Release-Note:`; feature specs keep
      `feat`, bug specs keep `fix`. Add where the repo's commit guidance for
      specs lives (skittership's `commit-messages.md` is not ours to edit —
      put it in `spec-planning.md` or the `/spec` and `/commit`-adjacent
      seams the assets own).
- [ ] Update `docs/reference.html` (spec types/prefixes) and bump its
      `verified:`, same commit as the asset changes.
- [ ] Tests: extend the asset tests (`assets-*.test.js`) that pin kind lists
      or templates; typecheck + tests green.

## Notes

Asset changes reach consumers via `skitterspec update` — call that out in the
release note for this phase's commit.
