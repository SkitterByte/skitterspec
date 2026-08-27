---
name: spec-push
description: Push a spec up to its linked Linear issue (repo → Linear, one-way). The repo is the source of truth; Linear is a generated mirror. A spec is a Linear issue and each phase a sub-issue; tasks are not synced. Runs `skitterspec spec-sync push` to get a create/update plan, applies it over MCP (issue description/state, phase sub-issues), stamps the returned ids back into the spec, then records the snapshot. Never reads Linear content back. Opt-in — needs specs/.core/linear.config.json. Use when the user says "/spec-push", "push to Linear", "update the Linear issue from this spec".
---

# /spec-push — send a spec up to Linear (one-way)

Repo → Linear. The repo is the **source of truth**; Linear is a **generated
mirror**. A spec is a Linear **issue**; each phase is a **sub-issue** (a child
issue). Tasks are not synced — they live only in the repo phase files. This skill
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

## 3. Discover the Linear MCP tools

Discover the issue **read + create/update** tools at runtime (`get_issue`,
`save_issue` — a single upsert covers create and update). If Linear isn't
connected or a needed tool is missing, relay the fix and stop, **writing
nothing**.

**Validate the issue states first.** Fetch the workspace's issue workflow-state
names and run `skitterspec spec-sync status <spec> --workspace-states <file>`; if
it errors (a configured `states` name isn't in the workspace), stop and fix the
config — Linear silently ignores an unknown issue state.

## 4. Apply the plan (order matters)

1. **Spec issue** → if the overview has no `linear_identifier`, create it with
   `save_issue` (`team` = `linear.teamId`; set `project` = `linear.projectId`
   when configured, to group it; `title` from the spec title; `description` from
   `plan.issue.description`; state from `plan.issue.state` via `config.states`).
   Stamp the returned identifier into `00-overview.md` frontmatter as
   `linear_identifier` (and `linear_url`). If it already exists and `plan.issue`
   is present, update it by id.
2. **Sub-issues create** → for each, `save_issue` with `parentId` = the spec
   issue id (`name` → title, `goal` → description, `state` via `config.states`);
   stamp the returned id into its phase file as `linear_issue_id` (`ref` is the
   phase-file basename).
3. **Sub-issues update** → `save_issue` by `id` (title/description/state).

If `linear.projectId` is set but the Project is archived or missing, relay
Linear's error and stop, **writing nothing** already stamped beyond what
succeeded.

Priority, labels, cycles and comments are Linear-native triage — do **not** push
them; they're the PM's.

## 5. Record the snapshot

After everything applied and the ids are stamped into the files:

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
