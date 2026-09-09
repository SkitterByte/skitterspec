---
linear_issue_id: "SKS-94"
---

# Phase 2 — Authoring skills ask and emit the header ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** with gating configured, a spec written by `/spec`, `/spec-bug` or
`/spec-hotfix` always carries a `Gating:` header, and the skill asked before
writing it; with gating absent, the output is unchanged.

## Tasks

- [x] `assets/skills/spec/SKILL.md`: add a Phase A grill item beside item 9
      (isolation stack), gated *(only when `specs/.core/gating.config.json`
      exists)* — should this ship behind a feature flag, or land live? **Offer, do
      not impose**; cite `guidance` when set; record the answer either way.
- [x] `assets/skills/spec/SKILL.md`: add `> **Gating:**` to the header template
      directly under `> **Stack:**`, with the flag-name-or-`none: <reason>` grammar
      and a note that an empty value is not a valid outcome.
- [x] Extend the skill's existing "record the isolation stack" finish-up phase to
      also confirm the `Gating:` header matches the grill answer, or add a sibling
      phase — whichever reads better once in the file.
- [x] `assets/skills/spec-bug/SKILL.md`: same grill item and header line — a bug
      fix ships in the next release like a feature.
- [x] `assets/skills/spec-hotfix/SKILL.md`: pre-fill
      `none: hotfix — restoring released behaviour`, ask only to confirm, and emit
      the same header. Say why the default differs.
- [x] `assets/rules/spec-planning.md`: document the `Gating:` header in the header
      fields section and the config gate alongside the isolation and provider gates.
      This is the canonical reference the skills point at.
- [x] Keep every edit inside `packages/common/assets/` — `packages/skitterspec*/assets/`
      is composed and gitignored, so editing it would be lost and duplicated.
- [x] Honour `.claude/rules/spec-planning.md`'s markdown rule: never let a `**bold**`
      span or a link cross a hard line break.
- [x] Extend `packages/common/test/assets.test.js` (or a sibling) to assert each of
      the three authoring skills carries the `Gating:` template line, states the
      config gate, and phrases the question as an offer.
- [x] Run `node --test` and `node scripts/build-dist.js all` — green before the
      phase is done.

## Notes

**As built.**

- The `/spec` record step is its own **Phase D2**, beside the isolation-stack one
  rather than folded into it. They gate on different config files and one is
  provisioning while the other is a record; merging them would have made both
  conditions harder to read.
- The grill item is **10**, and "Open questions" moved to 11.
- `/spec-bug` asks the question cold, like a feature — a bug fix ships in the next
  release, and a risky rewrite of a broken path is exactly where a kill-switch
  earns its keep.
- `/spec-hotfix` pre-fills `none: hotfix — restoring released behaviour` and says
  **why** the default differs: the fix is captured by a deploy tag rather than
  riding the next release, so a flag has nothing to gate and nothing to roll back
  to. It is stated as a default, not a rule, and the test asserts that wording.
- **Five emphasis spans I wrote crossed a hard line break**, which
  `.claude/rules/spec-planning.md` forbids because round-tripping editors mangle
  them. Caught by checking for an odd `**` count per line; fixed. Pre-existing
  ones elsewhere in these files were left alone as unrelated churn.
