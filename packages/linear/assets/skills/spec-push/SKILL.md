---
name: spec-push
description: Push a spec up to its linked Linear issue (repo → Linear, one-way). The repo is the source of truth; Linear is a generated mirror. A spec is a Linear issue and each phase a sub-issue, with the phase's tasks mirrored read-only into that sub-issue's description. Runs `skitterspec spec-sync push` to get a create/update plan, applies it over MCP (issue description/state, phase sub-issues), stamps the returned ids back into the spec, then records the snapshot. Never reads Linear content back. Opt-in — needs specs/.core/linear.config.json. Use when the user says "/spec-push", "push to Linear", "update the Linear issue from this spec".
---

# /spec-push — send a spec up to Linear (one-way)

Repo → Linear. The repo is the **source of truth**; Linear is a **generated
mirror**. A spec is a Linear **issue**; each phase is a **sub-issue** (a child
issue), and a phase's tasks are mirrored into that sub-issue's description as a
read-only checklist — never as issues of their own. This skill
computes what changed since the last push and applies it — it never reads Linear
content back or merges. A person editing the mirror in Linear will see it
overwritten on the next push.

**Opt-in**: only runs when `specs/.core/linear.config.json` exists. If absent,
tell the user how to enable Linear sync and stop.

## 1. Identify the target spec

Use the argument, else the spec in context; ask if unclear.

## 2. Get the plan from the engine

```
skitterspec spec-sync push <spec> --json
```

The engine prints a JSON **plan** (no network, no remote read):

```json
{
  "issue": { "description": "…", "state": "in-progress" },
  "subIssues": {
    "create": [{ "ref": "01-outbox", "name": "Outbox", "goal": "…", "state": "backlog" }],
    "update": [{ "id": "REU-2", "name": "…", "goal": "…", "state": "in-progress" }]
  }
}
```

An empty plan (no `issue`, no sub-issue create/update) means the mirror is up to
date — say so and stop. `state` values are local buckets
(`backlog`/`in-progress`/`complete`/`cancelled`); map each to the Linear
issue-state NAME via `config.states` at apply time.

### Stop if the plan reports a pre-9.0 mirror

If the plan carries a **`legacy`** field, this spec was linked under the pre-9.0
model (`linear_project_id` / `linear_milestone_id`). v9 reads the new keys, finds
none, and the plan above is therefore **all-creates** — applying it mints a fresh
mirror and **abandons** the existing one. **Stop.** Relay `legacy.keys`,
`legacy.files` and `legacy.orphanCount` ("this would orphan N live objects"),
point at `MIGRATION.md` → "v8 → v9", and apply nothing until the user has
migrated or explicitly confirms they want a new mirror.

## 3. Discover the Linear MCP tools

Discover the issue **read + create/update** tools at runtime (`get_issue`,
`save_issue` — a single upsert covers create and update), plus the **project
list** tool if this push will mint the spec issue (see the picker below — it is
optional; without it the picker is skipped, not failed). If Linear isn't
connected or a needed tool is missing, relay the fix and stop, **writing
nothing**.

**Validate the issue states first.** Fetch the workspace's issue workflow-state
names and run `skitterspec spec-sync status <spec> --workspace-states <file>`; if
it errors (a configured `states` name isn't in the workspace), stop and fix the
config — Linear silently ignores an unknown issue state.

## 4. Apply the plan (order matters)

1. **Spec issue** → if the overview has no `linear_identifier`, this push
   **mints** it: run the picker in **Picking the Linear Project** below, then
   create it with `save_issue` (`team` = `linear.teamId`; `project` = the picked
   id; `title` from the spec title; `description` from `plan.issue.description`;
   state from `plan.issue.state` via `config.states`). Keep the returned
   identifier and url for step 5 — don't hand-edit frontmatter. If it already
   exists and `plan.issue` is present, **update it by id and send no `project`**
   — its placement is Linear's from then on.
2. **Sub-issues create** → for each, `save_issue` with `parentId` = the spec
   issue id (`name` → title, `goal` → description, `state` via `config.states`).
   Keep each returned id against its `ref` (the phase-file basename).
3. **Sub-issues update** → `save_issue` by `id` (title/description/state).

Priority, labels, cycles and comments are Linear-native triage — do **not** push
them; they're the PM's.

## 5. Stamp the ids, then record the snapshot

Write every id you collected back into the spec in **one** call — the engine
does the file edits, so there is no hand-editing of frontmatter:

```
skitterspec spec-sync stamp <spec> \
  --issue SKI-11 --url https://linear.app/… \
  --sub 01-outbox=SKI-12 --sub 02-api=SKI-13
```

Pass `--issue`/`--url` only on the push that minted the spec issue; pass one
`--sub <ref>=<id>` for every sub-issue **created** in step 4.2 (updates already
have their id). It validates every ref and id **before** writing anything and
exits non-zero having changed nothing if any is wrong — so a typo can't leave the
spec half-stamped, pointing at an issue that isn't there. Fix what it reports and
re-run; it is safe to repeat.

Then record what was pushed:

```
skitterspec spec-sync record <spec>
```

This writes the last-pushed snapshot from the now-stamped files, so the next
`/spec-push` produces an empty plan. Commit the stamped spec + snapshot into the
branch so the mirror-link rides in the PR.

## 6. Report

Summarise what was created/updated in Linear (the spec issue and its
sub-issues) and confirm the snapshot was recorded. There is no pull — Linear is
a generated mirror.

<!-- seam:spec-project-picker -->
