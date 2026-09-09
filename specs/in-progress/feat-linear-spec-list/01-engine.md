---
linear_issue_id: "SKS-116"
---

# Phase 1 — `spec-sync list`, the engine and the live listing ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec spec-sync list` prints every live spec issue with its
identifier, title, Linear state and local spec name — proven by tests over a fake
adapter, including a capped result that says so.

## Tasks

- [ ] Extend `ISSUE_FIELDS` in `src/api.js` with `priority`, `sortOrder`,
      `assignee { id name }` and `parent { id }`, so one query serves every
      column this feature needs.
- [ ] Add `listIssues({ teamId, stateIds, assigneeId, parentless, first, after })`
      to the API adapter, returning `{ nodes, pageInfo }` and looping until the
      requested count is satisfied or Linear runs out.
- [ ] Add `specSyncList(dir, config, flags, out)` in `src/cli-sync.js`: resolve the
      transport with the same `key.ok` / `--via` / `config.apply.transport` ladder
      `specSyncProjects` uses, and `degrade(...)` identically on `mcp`.
- [ ] Resolve the default state set from `config.states.backlog` and
      `config.states['in-progress']` — read the existing table, never a new list.
      Support `--state <name>` (repeatable) and `--all`.
- [ ] Keep only **parentless** issues (decision 2) and join
      `listSpecs(dir, config)` on `linear_identifier` to attach `spec` and local
      `bucket`; render an unmatched issue as `— (not linked here)` rather than
      dropping it.
- [ ] Print the scope, the transport and the count as `showing <n> of <total>`,
      plus a line naming archived issues as excluded (decisions 4 and 5). Support
      `--limit N` and `--archived`.
- [ ] Wire `case 'list':` into the `specSync` dispatch and add the `list` line to
      the usage block.
- [ ] Add `test/cli-list.test.js` covering: a live listing over a fake adapter;
      phase sub-issues excluded by `parentId`; an unlinked issue reported and
      marked, **not** hidden (the stays-silent test from
      `.claude/rules/negative-checks.md` — a healthy issue this command has no
      local record of must still appear); a capped result printing
      `showing 5 of 23`; `--json` shape; and `transport = mcp` degrading with no
      Linear call.
- [ ] Run `pnpm test` in `packages/linear` and at the repo root — green before the
      phase is done. (This repo has no separate typecheck step.)

## Notes

`specSyncProjects` (`src/cli-sync.js`) is the reference implementation for the
transport ladder and the `degrade` helper — follow it rather than inventing a
second shape. `listSpecs` is already exported from `cli-sync.js` and is what
`spec-sync linked` uses, so the join needs no new reader.
