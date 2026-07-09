---
name: spec-pull
description: Pull a spec's linked Linear project into the local spec (Linear → repo), three-way aware. Applies remote-only fields; refuses to clobber local edits on a conflict unless --force (which backs up the local side first). Fetches Linear over MCP and runs `skitterspec spec-sync pull`. Opt-in — needs specs/.core/linear.config.json. Use when the user says "/spec-pull", "pull from Linear", "sync Linear changes down", or "update this spec from Linear".
---

# /spec-pull — bring Linear changes into the spec

Linear → repo. Applies fields Linear changed since the last sync (status,
priority, labels, and co-authored fields), rewrites the committed base, and
stamps `last_synced_at`. It **refuses** to overwrite a local edit that conflicts
with a Linear edit unless you pass `--force`.

**Opt-in**: only runs when `specs/.core/linear.config.json` exists. If absent,
tell the user how to enable Linear sync and stop.

## 1. Identify the target spec

Use the argument, else the spec in context; ask if unclear.

## 2. Fetch the Linear project

- Read `linear_project_id` from `00-overview.md` frontmatter; if missing, the
  spec isn't linked — stop and point at `/spec`.
- Discover the Linear MCP project-read tool at runtime. If Linear isn't
  connected, relay the fix and stop — **do nothing destructive**.
- Call it and write the project JSON to a temp file.

## 3. Run the engine

```
skitterspec spec-sync pull <spec> --remote <tempfile> [--force]
```

- **No conflict** — the engine applies remote-only fields to the local snapshot,
  rewrites the base, and stamps the sync. Body fields with no local home yet are
  reported as `deferred` (apply them by hand from Linear if needed).
- **Conflict** (a co-authored field changed on both sides) — the engine
  **refuses** and lists the fields. Relay that; do not force on the user's behalf.
- **`--force`** — only when the user explicitly asks. Remote wins after the engine
  backs up the local side under `sync.backupDir` (the reflog). Relay the backup
  path.

## 4. Report

Relay the git-like summary (applied / deferred / conflicts / backup / base). If
fields were applied, remind the user to review and commit the refreshed snapshot.
