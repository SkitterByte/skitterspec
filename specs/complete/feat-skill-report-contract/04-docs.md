---
linear_issue_id: "SKS-195"
---

# Phase 4 — Update the outward-facing surfaces ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the contract is described where people read about skitterspec before
installing it, and no shipped prose contradicts it.

## Tasks

- [x] Add a short paragraph to `packages/common/assets/rules/spec-planning.md`
      naming the contract and linking it — that file is the canonical reference
      every skill points at, so a reader who never opens a `SKILL.md` still meets
      the ending they will see.
- [x] Add the same, shorter, to `packages/common/assets/claude-md-section.md`,
      which is written into every consumer's `CLAUDE.md`.
- [x] Update `README.md`, `packages/common/README.md`,
      `packages/skitterspec*/README.md` and `docs/index.html` — one worked block
      is worth more than a description of one.
- [x] Run `scripts/docs-claims.test.js` and fix anything it catches; add a
      retired-claim pattern if the rewrite retires a phrase that still reads as
      current elsewhere.
- [x] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

`assets-prose.test.js` will now be discovering rules (phase 1), so the new rule
is already guarded against naming a skill that does not ship. This phase is about
the surfaces `docs-claims.test.js` owns — the ones a prospective user reads
before they install anything.
