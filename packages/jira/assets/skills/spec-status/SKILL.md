---
name: spec-status
description: Show a spec's one-way sync status against Jira — a read-only drift report naming what would push, and whether the tracker's status has drifted from the spec's. Changes nothing. Opt-in — needs specs/.core/jira.config.json. Use when the user says "/spec-status", "is this spec in sync with Jira", "what would push", or "show spec sync status".
disable-model-invocation: true
---

# /spec-status — one-way sync drift report

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

Read-only. Reports two things and writes nothing:

1. **Pending push** — has the spec changed since the last push (is there an issue
   description/state or any phase subtask to create or update)?
2. **State drift** — does Jira's issue status differ from the spec's status?
   (The repo wins on the next push; this is just a heads-up, e.g. a card moved
   on the board.)

The repo is the source of truth; Jira is a generated mirror, so there is no
per-field "conflict" — only "what would the next push send" and "did the mirror
drift".

**Opt-in**: only runs when `specs/.core/jira.config.json` exists. If absent,
tell the user how to enable Jira sync and stop.

## 1. Identify the target spec

Use the argument, else the spec in context; ask if unclear.

## 2. Fetch the Jira issue (optional, for drift)

If the spec has a `jira_identifier`, discover the Jira MCP read tool
(`getJiraIssue`) and write the issue JSON to a temp file. If Jira isn't
connected, skip the drift lines (still report pending-push).

**Write the whole issue, including its `description`.** The engine reports two
independent kinds of drift off that one file: the status someone moved, and the
**description someone edited**. Write only the status fields and the second
check has nothing to look at — and it says nothing rather than guessing, so the
loss is silent. Keep `url` too: it is what the description line points the
reader at.

**The description itself never enters the conversation.** The engine hashes it
and compares hashes; what it prints is *that* the text changed, plus where to
read it. Do not open the temp file, and do not paste the description into your
report.

Optionally fetch the project's status names to a file to validate the
configured `states` at the same time.

## 3. Run the engine

```
skitterspec spec-sync status <spec> [--remote <issuefile>] [--workspace-states <statesfile>]
```

- Reports `push: pending — N to create, M to update` or `up to date`.
- With `--remote`, adds a `drift:` line comparing Jira's issue status to the
  spec's status.
- With `--workspace-states`, fails loudly if a configured status name isn't in
  the project (no workflow transition could ever reach it, so the push would
  refuse at apply time).

## 3b. A key mismatch is a different problem

If the spec's `jira_identifier` carries a **different project key** than
`jira.projectKey` in `specs/.core/jira.config.json` — or the issue read in step
2 came back under another key — the issue was moved or the project key changed,
and the repo's stamps are stale. That is not push drift and `/spec-push` cannot
fix it: it will fail with `no Jira issue found for <old>-<n>`.

The Linear provider ships `retarget` to rewrite stale stamps; the Jira provider
does not yet. Say so, name the two keys, and stop. Do not attempt the rewrite by
hand — the identifiers live in frontmatter, snapshot filenames and the keys
inside those snapshots, and a hand edit misses some.

## 4. Report

Relay the engine's output **verbatim, above the block** — it is the answer, and
the block is the verdict on it. Never write to either side.

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — in sync; nothing would push.
- `⚠️` — drift: N objects would push, Jira's status was moved by hand, or the
  issue's **description** was edited on Jira since the last push. None is an
  error — the repo wins on the next push — but all are the reason someone ran
  this. **Say which**, since the three call for different things: a pending push
  is routine, a moved status is usually someone else's automation, and an edited
  description means a person wrote something that the next push replaces.
- `⏸` — no config, or the spec is not linked. Nothing to compare.

**Fields:** `Tracker` · `Follow-ups` · `Next`

`Tracker` is the drift in one line — what would push, and whether the tracker's
status diverged. `Next` is `/spec-push` when a push is pending, and nothing to
do when it is not.

A **`phases: <mode>`** line names the phase mode that resolved for this spec's
lifecycle bucket, and appears only when it is not the default `subissue`.
`mapping.phases` may be a per-bucket map, so this is the only place the mode a
given spec got is stated. Under **`inline`** the phases live in the spec issue's
description rather than as subtasks, so "0 to create" is the expected shape
rather than a sign the phase files failed to parse; under **`deferred`** the
`N phase(s) deferred` line above it says how many are still waiting on
`/spec-next`. Relay both lines as printed.
