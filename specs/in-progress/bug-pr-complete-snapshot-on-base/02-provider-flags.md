---
github_issue_id: "#218"
---

# Phase 2 — Provider CLIs: `--hold-state` / `--send-held` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `spec-sync apply <spec> --hold-state` and `--send-held` reach the
engine on every provider. `--send-held` needs no `--plan` file, because it
computes its own plan.

## Tasks

- [x] github, azure-boards, linear: parse both flags in `specSyncApply`, pass them
      to `applySpecPlan`, and let `--send-held` build its plan from `push` when
      `--plan` is absent.
- [x] jira: same flags on its apply path (it calls the shared `applySpecPlan`
      too, so this is the same wiring as the other three).
- [x] MCP transport: `--hold-state` and `--send-held` add a note
      (`kit.heldOverMcp`) saying what to apply by hand. `record` then has to
      write the same snapshot, so add `record --held` (sent.issue = true).
- [x] CLI tests per provider: flags parsed, refused together, and help text
      lists them. Run `pnpm -r test`, all green.
