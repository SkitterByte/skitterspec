---
github_issue_id: "#56"
---

# Phase 1 — State-map edits re-push State ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** Editing the mapped state name for `backlog`, `in-progress` or
`cancelled` resends State on the next push. `complete` never does. Proven by
sync-core tests and an Azure push test.

## Tasks

- [ ] In `sync-core/src/compare.js`, hash State as `bucket→states[bucket]` for
      every bucket except `complete`, which keeps the bare bucket
      (`specIssueFieldHashes`). Pass `config` through the `issueChanges` call
      that omits it today.
- [ ] Write the blind spot beside it (`.claude/rules/negative-checks.md`
      rule 2): push cannot see a ladder rung, so a complete re-push would
      regress a deployed ticket.
- [ ] Check the Linear, Jira and GitHub callers pass `config`. A provider
      without a `states` map hashes exactly as before.
- [ ] Tests:
      - a `states.backlog` rename changes the state hash and plans a State
        update;
      - a `states.complete` rename does not (stays-silent test);
      - an old bucket-only snapshot plans one State resend, then is in sync.
- [ ] Docs: `azure-boards.config.md` → "Choosing your state map" notes that a
      state-map edit moves existing tickets on the next push, except
      `complete`, and why.
- [ ] Run `pnpm test` (and `pnpm -r typecheck` where present). Green before the
      phase is done.
