---
github_issue_id: "#88"
---

# Phase 3 — Per-type state overrides + per-type pre-write check ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a bucket's state can differ by work item type (Azure/Jira) or spec
kind (GitHub/Linear), `null` sends no state, and a state a type lacks refuses
before the first write, naming the type and the state.

## Tasks

- [x] Azure: `statesByType` config key (top-level beside `states`; type name →
      partial bucket map, `null` allowed), parsed by a shared
      `mergeStateOverrides` in provider-kit; the mint/child type threaded into
      `stateFor`/`settle`/`prevalidateStates`; missing buckets fall through
- [x] Azure: per-type pre-write check — `states --json` now emits
      `{ "<type>": [names] }`, the check validates each configured type's
      effective states against that type's own list and refuses naming the
      type and the state; a legacy flat array is still accepted as the union
      check; `doctor --check-remote` checks per type too
- [x] Jira: `statesByType` (issue type name → partial bucket map, `null`
      allowed); new `listIssueStatesByType` adapter call feeds the keyed
      `states --json` and the same per-type check (transitions stay the
      runtime mechanism)
- [x] GitHub: `statesByKind` (spec kind → partial bucket map, `null` allowed)
      over the board's single Status option set; board-option validation
      covers override names via `configuredStateNames`; `null` skips the
      Status write while open/close (derived from the bucket) still runs
- [x] Linear: `statesByKind`, same semantics, resolved inside `stateIdFor`;
      override names validated via `configuredStateNames`
- [x] `null` semantics everywhere: the transition is skipped entirely — no
      state write, no error
- [x] `spec-sync states` output reflects the per-type view where overrides
      exist (Azure/Jira TTY print each override checked against its type;
      `--json` is keyed by type)
- [x] Tests: Issue completes to Closed while a Chore completes to Resolved
      (azure, jira, github, linear variants); Issue sent Resolved refuses
      pre-write naming "Issue" and "Resolved" (azure + jira, plan exits 1
      before any adapter call); `null` bucket sends no transition (all four);
      overrides read back as their bucket; configs without any override are
      pinned by the pre-existing suites (stays-silent)
- [x] Run `pnpm -r test` + typecheck — green (packages 0 failures, root 4,215
      pass; no typecheck script in this repo)
