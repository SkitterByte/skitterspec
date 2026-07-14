---
name: spec-status
description: Show a spec's sync status against its linked Linear project — a read-only, git-status-style per-field divergence (local-only / remote-only / conflict / in-sync). Fetches the Linear project over MCP and runs `skitterspec spec-sync status`. Changes nothing. Opt-in — needs specs/.core/linear.config.json. Use when the user says "/spec-status", "is this spec in sync with Linear", "what's diverged from Linear", or "show spec sync status".
---

# /spec-status — show a spec's divergence from Linear

Read-only. Prints, per field, whether the spec and its linked Linear project have
diverged since the last sync — the `git status` of the hybrid sync. Writes
nothing to either side.

This skill is **opt-in**: it only runs when `specs/.core/linear.config.json`
exists. If it's absent, tell the user to copy `linear.config.json.example` →
`linear.config.json` to enable Linear sync, and stop.

## 1. Identify the target spec

Use the spec named as an argument, else the spec **currently in context**. If
neither is clear, ask which spec.

## 2. Fetch the Linear project (read-only)

- Read the spec's `linear_project_id` from `00-overview.md` frontmatter. If it's
  missing, the spec isn't linked yet — say so and stop (link it via `/spec`).
- Discover the connected Linear MCP tools at runtime (the project-read tool). If
  Linear isn't connected, relay "connect the `linear` MCP server" and stop — do
  nothing else.
- Call the project-read tool for that id and write the returned JSON to a temp
  file (e.g. under the OS temp dir).

## 3. Run the engine

```
skitterspec spec-sync status <spec> --remote <tempfile>
```

The engine does the three-way compare (local vs Linear vs the committed base) and
prints each diverged field with its classification and sync direction. Without
`--remote` it falls back to a local-vs-base comparison (still read-only).

## 4. Report

Relay the engine's summary verbatim, then offer the natural next step:
`/spec-pull` for remote-only changes, `/spec-push` for local-only, and — for a
`conflict` — resolve locally or use `--force` (which backs up the losing side).
Never write anything from this skill.
