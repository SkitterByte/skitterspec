---
name: spec-status
description: Show a spec's one-way sync status against Linear — a read-only drift report. Reports whether the spec changed since the last push (there's something to push) and, optionally, whether Linear's issue workflow-state differs from the spec's. Fetches the Linear issue over MCP and runs `skitterspec spec-sync status`. Changes nothing. Opt-in — needs specs/.core/linear.config.json. Use when the user says "/spec-status", "is this spec in sync with Linear", "what would push", or "show spec sync status".
---

# /spec-status — one-way sync drift report

Read-only. Reports two things and writes nothing:

1. **Pending push** — has the spec changed since the last push (is there an issue
   description/state or any phase sub-issue to create or update)?
2. **State drift** — does Linear's issue workflow-state differ from the spec's
   status? (The repo wins on the next push; this is just a heads-up, e.g. a card
   moved in Linear.)

The repo is the source of truth; Linear is a generated mirror, so there is no
per-field "conflict" — only "what would the next push send" and "did the mirror
drift".

**Opt-in**: only runs when `specs/.core/linear.config.json` exists. If absent,
tell the user how to enable Linear sync and stop.

## 1. Identify the target spec

Use the argument, else the spec in context; ask if unclear.

## 2. Fetch the Linear issue (optional, for drift)

If the spec has a `linear_identifier`, discover the Linear MCP read tool
(`get_issue`) and write the issue JSON to a temp file — this lets the report
compare workflow-state. If Linear isn't connected, skip the drift line (still
report pending-push).

Optionally fetch the workspace issue-state names to a file to validate the
configured `states` at the same time.

## 3. Run the engine

```
skitterspec spec-sync status <spec> [--remote <issuefile>] [--workspace-states <statesfile>]
```

- Reports `push: pending — N to create, M to update` or `up to date`.
- With `--remote`, adds a `drift:` line comparing Linear's issue workflow-state
  to the spec's status.
- With `--workspace-states`, fails loudly if a configured state name isn't in the
  workspace (Linear would silently no-op it).

## 4. Report

Relay the engine's output verbatim. Suggest `/spec-push` if a push is pending.
Never write to either side.
