---
github_issue_id: "#88"
---

# Phase 3 — Per-type state overrides + per-type pre-write check ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a bucket's state can differ by work item type (Azure/Jira) or spec
kind (GitHub/Linear), `null` sends no state, and a state a type lacks refuses
before the first write, naming the type and the state.

## Tasks

- [ ] Azure: `azure.statesByType` config key (type name → partial bucket map,
      `null` allowed); thread the mint type into `stateFor` / `settle`
      (`packages/azure-boards/src/cli-sync.js:166-176`) and the MCP twin;
      missing buckets fall through to `states[bucket]`
- [ ] Azure: replace the union check — validate each mint type's **resolved**
      states against that type's own `listIssueStates`; refusal names the type
      and the state (rework `unionStates`, cli-sync.js:377, and
      `prevalidateStates`)
- [ ] Jira: `jira.statesByType` (issue type name → partial bucket map, `null`
      allowed) resolved the same way; pre-write validation asks each issue
      type's statuses rather than one shared list (transitions stay the
      runtime mechanism, `packages/jira/src/api.js:203`)
- [ ] GitHub: `github.statesByKind` (spec kind → partial bucket map, `null`
      allowed) over the board's single Status option set
      (`packages/github/src/cli-sync.js:153`); validation checks the resolved
      names against the board options as today
- [ ] Linear: `linear.statesByKind`, same semantics, validated against the
      team's workflow states
- [ ] `null` semantics everywhere: the transition is skipped entirely — no
      state write, no error (e.g. an Incident created in `in-progress` is
      never sent New)
- [ ] `spec-sync states` output reflects the per-type view where overrides
      exist (name which type each resolved state was checked against)
- [ ] Tests: with `statesByType.Issue.complete = "Closed"`, completing an
      issue spec writes Closed while a chore spec still writes Resolved (one
      test each); Issue sent Resolved refuses pre-write naming "Issue" and
      "Resolved" and a test proves nothing was written; `null` bucket sends no
      transition; configs **without** any override behave byte-for-byte as
      today (stays-silent per provider)
- [ ] Run `pnpm -r test` + typecheck — green
