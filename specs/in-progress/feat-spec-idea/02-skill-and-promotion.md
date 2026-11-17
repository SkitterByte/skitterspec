---
github_issue_id: "#212"
---

# Phase 2 — `/spec-idea` skill and `/spec` promotion ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-idea` captures, lists and drops ideas, and `/spec idea:<id>`
promotes a file idea. Both skills end in the report block.

## Tasks

- [ ] Write `packages/common/assets/skills/spec-idea/SKILL.md` with these
      modes: `<text>` adds, bare lists, `--drop <ref> [reason]` discards. Add
      the offer-`/spec` judgement for text that is asking for design: offer
      once, then file on a decline. Define the report fields.
- [ ] Teach `/spec` the `idea:<id>` ref: seed Problem from the entry, and
      remove the entry in the spec's authoring commit through the stage
      pathspec (add `specs/ideas.md` to the owned set only when an idea is
      being promoted).
- [ ] Add `/spec-idea` to the skill table in `spec-planning.md`, and make sure
      `init`/`update` install the new skill.
- [ ] Tests: the skill install manifest includes `spec-idea`, `stage` owns
      `specs/ideas.md` only during a promotion, and the existing
      skill-contract tests pass. Run `pnpm test`. It must
      be green.
