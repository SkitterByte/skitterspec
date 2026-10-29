---
name: spec-status
description: Show a spec's one-way sync status against Linear — a read-only report naming what would push, and whether someone edited the issue's description since the last push. Changes nothing. Opt-in — needs specs/.core/linear.config.json. Use when the user says "/spec-status", "is this spec in sync with Linear", "what would push", or "show spec sync status".
disable-model-invocation: true
---

# /spec-status — one-way sync report

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

Read-only. Reports two things and writes nothing:

1. **Pending push** — has the spec changed since the last push (is there an issue
   description/state or any phase sub-issue to create or update)?
2. **Description edited** — did someone edit the issue's description on Linear
   since the last push? The next push replaces it, so this is worth reading
   first.

**Status is not compared, deliberately.** Skitterspec tells Linear about its
own transitions and never reads a status back: a card someone moved by hand is
theirs to have moved, and push resends State only when the spec itself moves.

The repo is the source of truth; Linear is a generated mirror, so there is no
per-field "conflict" — only "what would the next push send" and "did someone
write over the mirror's text".

**Opt-in**: only runs when `specs/.core/linear.config.json` exists. If absent,
tell the user how to enable Linear sync and stop.

## 1. Identify the target spec

Use the argument, else the spec in context; ask if unclear.

## 2. Fetch the Linear issue (optional, for the description check)

If the spec has a `linear_identifier`, discover the Linear MCP read tool
(`get_issue`) and write the issue JSON to a temp file. If Linear isn't
connected, skip the description check (still report pending-push).

**Write the whole issue, including its `description`.** That is the field the
check reads; without it the check has nothing to look at — and it says nothing
rather than guessing, so the loss is silent. Keep `url` too: it is what the
description line points the reader at.

**The description itself never enters the conversation.** The engine hashes it
and compares hashes; what it prints is *that* the text changed, plus where to
read it. Do not open the temp file, and do not paste the description into your
report.

Optionally fetch the workspace issue-state names to a file to validate the
configured `states` at the same time.

## 3. Run the engine

```
skitterspec spec-sync status <spec> [--remote <issuefile>] [--workspace-states <statesfile>]
```

- Reports `push: pending — N to create, M to update` or `up to date`.
- With `--remote`, adds a `drift:` line when the issue's description was
  edited on Linear since the last push, and nothing otherwise. It never
  reports the issue's state.
- With `--workspace-states`, fails loudly if a configured state name isn't in the
  workspace (Linear would silently no-op it).

## 3b. A key mismatch is a different problem

If the spec's `linear_identifier` carries a **different team key** than
`linear.teamKey` in `specs/.core/linear.config.json` — or the issue read in step
2 came back under another key — the team was renamed and the repo's stamps are
stale. That is not push drift and `/spec-push` cannot fix it: it will fail with
`no Linear issue found for <old>-<n>`.

Point the user at the CLI and stop:

```
pnpm exec skitterspec-linear spec-sync retarget
```

Read-only until `--yes`. Do not attempt the rewrite by hand — the identifiers
live in frontmatter, snapshot filenames and the keys inside those snapshots, and
a hand edit misses some (it has, twice).

## 4. Report

Relay the engine's output **verbatim, above the block** — it is the answer, and
the block is the verdict on it. Never write to either side.

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — in sync; nothing would push.
- `⚠️` — N objects would push, or the issue's **description** was edited on
  Linear since the last push. Neither is an error, but both are the reason
  someone ran this. **Say which**, since they call for different things: a
  pending push is routine, and an edited description means a person wrote
  something that the next push replaces.
  An `assignee` drift line is the third case: the assignee is a field the repo
  owns, so the next push restores the spec's record.
- `⏸` — no config, or the spec is not linked. Nothing to compare.

**Fields:** `Tracker` · `Follow-ups` · `Next`

`Tracker` is the answer in one line — what would push, and whether the
description was edited. `Next` is `/spec-push` when a push is pending, and nothing to do
when it is not.

A **`phases: <mode>`** line names the phase mode that resolved for this spec's
lifecycle bucket, and appears only when it is not the default `subissue`.
`mapping.phases` may be a per-bucket map, so this is the only place the mode a
given spec got is stated. Under **`inline`** the phases live in the spec issue's
description rather than as sub-issues, so "0 to create" is the expected shape
rather than a sign the phase files failed to parse; under **`deferred`** the
`N phase(s) deferred` line above it says how many are still waiting on
`/spec-next`. Relay both lines as printed.
