---
github_issue_id: "#101"
---

# Phase 1 — `/spec` signal routing + matrix in spec-planning.md ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec`'s grill watches for bug/hotfix/incident signals, confirms,
and hands off in-session with context; the routing matrix is documented once in
`spec-planning.md`.

## Tasks

- [ ] Add a **"Watch for the other doors"** subsection to Phase A of
      `packages/common/assets/skills/spec/SKILL.md`: example signals per kind
      (defect · on-released · live outage), raise the moment one appears,
      always confirm naming the signal in the user's words, a decline carries
      the grill on and is not re-raised, precedence incident > hotfix > bug,
      and on a confirmed switch invoke the target skill in-session seeded with
      everything already established.
- [ ] Update the **"Propose the kind"** section to cross-reference the watch
      (the existing one-line `/spec-incident` hand-off becomes part of the
      routing, not a special case).
- [ ] Document the full routing matrix + signal examples + precedence once in
      `packages/common/assets/rules/spec-planning.md` (the skills reference it
      rather than restating it).
- [ ] Add/extend an assets test (`packages/common/test/`) pinning: the spec
      skill carries the watch section, the confirm-first rule, and the
      precedence line; spec-planning.md carries the matrix. Run
      `pnpm test --filter @skitterbyte/skitterspec-common` (or the repo's
      per-package test command) — green before the phase is done.

## Notes

The watch is provider-agnostic and lives in the base skill — it must read
correctly with no ticketing provider installed. Keep it short: signals are
examples for judgment, not an exhaustive list.
