---
name: spec-push
description: Push a spec's local content up to its linked Linear project (repo → Linear), three-way aware and ownership-respecting. Never pushes pull-owned fields or local-only sections; aborts if Linear moved since the last sync unless --force (which backs up the remote side first). Runs `skitterspec spec-sync push` then applies the blessed writes over MCP. Opt-in — needs specs/.core/linear.config.json. Use when the user says "/spec-push", "push to Linear", "sync my spec up to Linear", or "update the Linear project from this spec".
---

# /spec-push — send spec content up to Linear

Repo → Linear. Sends the fields the repo owns/co-authors (description, phases,
tasks per config) up to the linked project. It **never** writes `pull`-owned
fields (status/priority/labels) or `localOnlySections`, and it **aborts** if
Linear moved since the last sync (pull first) unless you `--force`.

**Opt-in**: only runs when `specs/.core/linear.config.json` exists. If absent,
tell the user how to enable Linear sync and stop.

## 1. Identify the target spec

Use the argument, else the spec in context; ask if unclear.

## 2. Fetch the Linear project

- Read `linear_project_id` from `00-overview.md` frontmatter; if missing, stop
  (link via `/spec` first).
- Discover the Linear MCP tools at runtime (project read **and** update). If
  Linear isn't connected — or the update tool is missing — relay the fix and stop,
  **writing nothing**.
- Call the read tool and write the project JSON to a temp file.

## 3. Run the engine (the guard)

```
skitterspec spec-sync push <spec> --remote <tempfile> --out <mergedfile> [--force]
```

- **Refused** (`remote-moved` / `concurrent-write` / conflict) — relay the message
  and **stop**. Do not write to Linear. Suggest `/spec-pull` first.
- **OK** — the engine has confirmed it's safe, rewritten the base, and stamped
  `last_synced_at`. Its summary lists the `written` fields (and any `skipped`
  because they're not pushable).
- **`--force`** — only when the user explicitly asks. Local wins after the engine
  backs up the remote side under `sync.backupDir`. Relay the backup path.

## 4. Apply the blessed writes to Linear

Only when step 3 returned OK: for each `written` field, call the Linear update
tool with that field's local value (e.g. `description` → the project description).
The engine has already vetted the change and moved the base — so if a Linear
write fails, re-run `/spec-pull` to reconcile rather than retrying blindly.

## 5. Report

Relay the git-like summary (written / skipped / backup / base) plus which Linear
fields you updated.
