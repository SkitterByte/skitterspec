---
name: spec-push
description: Push a spec up to its linked Linear project (repo → Linear, one-way). The repo is the source of truth; Linear is a generated mirror. Runs `skitterspec spec-sync push` to get a create/update plan, applies it over MCP (project description/status, milestones, issues), stamps the returned ids back into the spec, then records the snapshot. Never reads Linear content back. Opt-in — needs specs/.core/linear.config.json. Use when the user says "/spec-push", "push to Linear", "update the Linear project from this spec".
---

# /spec-push — send a spec up to Linear (one-way)

Repo → Linear. The repo is the **source of truth**; Linear is a **generated
mirror**. This skill computes what changed since the last push and applies it —
it never reads Linear content back or merges. A person editing the mirror in
Linear will see it overwritten on the next push.

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
  "project": { "description": "…", "status": "in-progress", "priority": 2, "labels": ["…"] },
  "milestones": { "create": [{ "ref": "01-outbox", "name": "…", "goal": "…" }], "update": [{ "id": "…", "name": "…", "goal": "…" }] },
  "issues": { "create": [{ "ref": "<task text>", "title": "…", "description": "…", "done": false, "milestoneRef": "01-outbox" }], "update": [{ "id": "SKI-1", "title": "…", "description": "…", "done": true }] }
}
```

An empty plan (no project, no create/update) means the mirror is up to date —
say so and stop.

## 3. Discover the Linear MCP tools

Discover project + milestone + issue **create/update** tools at runtime. If
Linear isn't connected or a needed tool is missing, relay the fix and stop,
**writing nothing**.

**Validate the project states first.** Fetch the workspace's project-status
names and run `skitterspec spec-sync status <spec> --workspace-states <file>`; if
it errors (a configured `states` name isn't in the workspace), stop and fix the
config — Linear silently ignores an unknown project status.

## 4. Apply the plan (order matters)

1. **Milestones create** → create each in Linear; for each, stamp the returned id
   into its phase file: the `ref` is the phase-file basename.
2. **Issues create** → create each (link to its milestone by `milestoneRef`,
   resolving a `create` ref to the id just minted); stamp the returned identifier
   back onto the matching task line (`ref` is the task's text).
3. **Milestones/issues update** → save by `id`.
4. **Project** → set description/status/priority/labels (map `status` — the local
   bucket — to the Linear project-status name via `config.states`).

Map the local status bucket to Linear's project status through `config.states`
(e.g. `complete → Completed`).

## 5. Record the snapshot

After everything applied and the ids are stamped into the files:

```
skitterspec spec-sync record <spec>
```

This writes the last-pushed snapshot from the now-stamped files, so the next
`/spec-push` produces an empty plan. Commit the stamped spec + snapshot into the
branch so the mirror-link rides in the PR.

## 6. Report

Summarise what was created/updated in Linear and confirm the snapshot was
recorded. There is no pull — Linear is a generated mirror.
