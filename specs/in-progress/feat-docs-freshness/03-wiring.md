---
github_issue_id: "#73"
---

# Phase 3 — Wiring: release.js, rules, docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the reports run where the decisions happen — `stale` inside the
release flow, `impact` and the `Docs:` header inside the spec workflow — all
advisory, documented where people will actually find them.

## Tasks

- [ ] Wire `stale` into `scripts/release.js`: print the report while cutting
      any package release — advisory, never blocks, a cannot-tell (missing
      SHA, no `.git`) prints and carries on. Extend `scripts/release.test.js`:
      one test that it prints on a stale page, one that a release proceeds
      regardless (stays-silent counterpart).
- [ ] Add the pre-release note to `RELEASING.md`: what the stale listing means
      (re-read, fix if needed, bump `verified` to the release's HEAD) and that
      it never gates.
- [ ] Write `.claude/rules/docs-freshness.md`: the `Docs:` header grammar
      (page names, or `none: <one-line reason>`; a bare `none` doesn't count),
      when to run `impact` (at spec completion, output into the completion
      report's Notes), and what none of this checks (correctness of prose,
      completeness of `covers`).
- [ ] Add a conventions line to CLAUDE.md pointing at the rule, beside the
      existing spec-workflow section.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

The rule file is repo-local and new — `skittership update` / `skitterspec
update` keep unknown files, so it survives upgrades without manifest work.
