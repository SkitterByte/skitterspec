---
github_issue_id: "#218"
---

# Phase 2 — Provider CLIs: `--hold-state` / `--send-held` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-sync apply <spec> --hold-state` and `--send-held` reach the
engine on every provider. `--send-held` needs no `--plan` file, because it
computes its own plan.

## Tasks

- [ ] github, azure-boards, linear: parse both flags in `specSyncApply`, pass them
      to `applySpecPlan`, and let `--send-held` build its plan from `push` when
      `--plan` is absent.
- [ ] jira: same flags on its apply path (it does not call the shared
      `applySpecPlan`, so mirror the hold/send in its own apply).
- [ ] MCP transport: `--hold-state` prints the plan with the issue state stripped,
      and `--send-held` prints the single state write. `record` then has to
      write the same snapshot, so add `record --held` (sent.issue = true).
- [ ] CLI tests per provider: flags parsed, refused together, and help text
      lists them. Run `pnpm -r test`, all green.
