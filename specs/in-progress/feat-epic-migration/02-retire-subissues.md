---
github_issue_id: "#168"
---

# Phase 2 — Retire an epic's leftover sub-issues ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** an epic's first push closes and unlinks the plan's old phase
sub-issues, and forgets them.

## Tasks

- [ ] `planChanges`: for an epic, every snapshot sub-issue id goes to
      `subIssues.retire`; any other kind is unchanged
- [ ] `applySpecPlan`: run `retire` through optional `retireSubIssue(id)`;
      absent → one line naming the ids; a failure → `??` line, id kept in the
      snapshot
- [ ] GitHub adapter: close as not planned, remove the sub-issue link; read
      back
- [ ] `/spec-push` (github) MCP path: the retire step with the issue tools
- [ ] Tests: the plan lists retire for an epic only; apply closes and unlinks,
      and the next plan is empty; a tracker without the seam names the ids;
      stays silent — a feature with an unclaimed id still plans `unstamped`, not
      `retire`
- [ ] Run typecheck + tests — green before the phase is done
