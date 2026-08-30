# Set up Linear sync by interview, not by hand

> **Type:** Feature
> **Name:** feat-linear-setup-interview (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-08-30
> **Area:** packages/linear/src/cli-sync.js, packages/linear/assets/skills/spec-linear-setup/, packages/linear/assets/core/SETUP.md
> **Stack:** worktree

## Problem

Setting up Linear sync asks **nothing**. `init` drops
`linear.config.json.example` and `SETUP.md`, and the operator hand-copies a team
UUID obtained by asking Claude in chat. Every decision that shapes where specs
land is made by a human reading a document, with no discovery and no validation.

So the config never reflects how the workspace is actually organised, because
nothing ever asks. In particular:

- **Nothing asks how products map to the workspace.** One team or several,
  product-per-team or product-per-project — that single answer determines
  `teamId` and `projectId`, and it is the question a new install most needs
  answered.
- **State names are assumed, then checked much later.** `states` defaults to
  `Backlog / In Progress / Done / Canceled`. A workspace that renamed any of
  them gets a silent no-op from Linear, and the operator finds out at their
  **first push** — and only because `--workspace-states` was added later as a
  guard. `list_issue_statuses` could answer it during setup.
- **Labels are typed from memory.** `intake.label`, `bugLabels` and
  `hotfixLabels` are the routing rules for issue intake, entered blind;
  `list_issue_labels` is never called.

Every one of these is discoverable over the Linear MCP server the operator has
just connected. Nothing does the discovering.

## Decisions

1. **A `/spec-linear-setup` skill discovers and interviews; the engine writes the
   file.** MCP is where the workspace is reachable without an API key, which is
   exactly the state a first-time setup is in — so discovery belongs in a skill.
   Writing does not: a new `spec-sync init-config` validates the gathered values
   and emits the JSON, so the config never depends on the model composing it
   correctly. Same split as `/spec-push` gathering over MCP and `spec-sync apply`
   doing the write.
2. **Interview about structure, not just fields.** The gap is not "I cannot find
   my UUID" — it is that nobody asks how the work is organised. Ask which team
   this repo files into, whether the workspace splits products by team or by
   project, and whether specs should default to a project. Offer the real lists,
   never a blank prompt.
3. **Validate the state names at setup.** `validateStates` already exists and is
   called only at push time. Linear silently ignores an unknown issue state, so a
   rename produces a mirror that never moves; catching it while the operator is
   still in the setup conversation is strictly better than catching it on their
   first push.
4. **Manual setup stays documented.** Someone driving the CLI without Claude Code
   must still be able to configure by hand. The skill becomes the recommended
   path in `SETUP.md`, not the only one, and `init-config` is usable directly
   with flags.
5. **No initiative support in this spec.** The workspace has no initiatives
   today, so a picker filter would be speculative. Recorded as the known
   follow-on with its exact hook — `list_projects` accepts an `initiative`
   filter, and `api.js:190` queries `team(id) { projects }` with none.

## Solution overview

```
/spec-linear-setup
  ├─ discover over MCP     teams · projects · labels · issue states
  ├─ interview             which team · products by team or project · default project · intake labels
  └─ spec-sync init-config validate (incl. state names) → write specs/.core/linear.config.json
```

`init-config` refuses to overwrite an existing config without `--force`, and
reports what it validated, so re-running the skill on a configured repo is a safe
way to check the setup rather than a way to lose it.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-sync init-config` — validate + write the config |
| Skill/rule | add | `/spec-linear-setup` |
| Docs | update | `SETUP.md` leads with the skill, keeps the manual path |

Additive: an existing `linear.config.json` is untouched unless `--force`.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `spec-sync init-config` — validate and write | ⬜ | [01-init-config.md](01-init-config.md) |
| 2 | The `/spec-linear-setup` skill | ⬜ | [02-setup-skill.md](02-setup-skill.md) |
| 3 | Make it the documented path | ⬜ | [03-docs.md](03-docs.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-30 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-08-30 — Spec created after reviewing a real workspace (two teams, two
  projects, no initiatives) against what setup asks. Confirmed setup is entirely
  manual: `init` scaffolds a `.example` and a walkthrough, and no code prompts
  for or discovers anything.
- 2026-08-30 — Scoped initiatives out deliberately: with none in the workspace, a
  project-picker filter cannot be validated against real use.
