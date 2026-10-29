---
name: spec-status
description: Show a spec's one-way sync status against Azure Boards — a read-only drift report naming what would push, and whether the tracker's state has drifted from the spec's. Changes nothing. Opt-in — needs specs/.core/azure-boards.config.json. Use when the user says "/spec-status", "is this spec in sync with Boards", "what would push", or "show spec sync status".
disable-model-invocation: true
---

# /spec-status — one-way sync drift report

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

Read-only. Reports two things and writes nothing:

1. **Pending push** — has the spec changed since the last push (is there an item
   description/state or any phase child to create or update)?
2. **State drift** — does Boards' item state differ from the spec's status?
   (Push resends State only when the spec itself moves, so a card moved by
   hand stays where it was put until then. This is a heads-up, not a pending
   change.) A state skitterspec does not map is reported as
   `state: … left alone`, never as drift, and a `states` alias reads as its
   bucket.

The repo is the source of truth; Boards is a generated mirror, so there is no
per-field "conflict" — only "what would the next push send" and "did the mirror
drift".

**Opt-in**: only runs when `specs/.core/azure-boards.config.json` exists. If
absent, tell the user how to enable Azure Boards sync and stop.

## 1. Identify the target spec

Use the argument, else the spec in context; ask if unclear.

## 2. Fetch the work item (optional, for drift)

If the spec has an `azure_identifier`, discover the work-item read tool and
write the item JSON to a temp file. If Azure isn't connected, skip the drift
lines (still report pending-push).

**Write the whole item, including `System.Description`.** The engine reports
two independent kinds of drift off that one file: the state someone moved, and
the **description someone edited**. Write only the state field and the second
check has nothing to look at — and it says nothing rather than guessing, so the
loss is silent. Keep the url too: it is what the description line points the
reader at.

**The description itself never enters the conversation.** The engine hashes it
and compares hashes; what it prints is *that* the text changed, plus where to
read it. Do not open the temp file, and do not paste the description into your
report.

Optionally fetch the types' state names to a file to validate the configured
`states` at the same time.

## 3. Run the engine

```
skitterspec spec-sync status <spec> [--remote <itemfile>] [--workspace-states <statesfile>]
```

- Reports `push: pending — N to create, M to update` or `up to date`.
- With `--remote`, adds a `drift:` line comparing Boards' item state to the
  spec's status. A state that maps to no bucket gets a `state:` line
  instead — position, not drift.
- With `--workspace-states`, fails loudly if a configured state name isn't in
  the types (the write would be refused at apply time, after the description
  landed, so the push would refuse up front).

## 3b. A moved item is a different problem

If the item read in step 2 came back from a **different org or project** than
`azure.orgUrl`/`azure.project` in `specs/.core/azure-boards.config.json`, the
item was moved or the config changed, and the repo's stamps are stale. That is
not push drift and `/spec-push` cannot fix it: it will fail with
`no Azure work item found for AB#<n>`.

The Linear provider ships `retarget` to rewrite stale stamps; the Azure Boards
provider does not yet. Say so, name both places, and stop. Do not attempt the
rewrite by hand — the identifiers live in frontmatter, snapshot filenames and
the ids inside those snapshots, and a hand edit misses some.

## 4. Report

Relay the engine's output **verbatim, above the block** — it is the answer, and
the block is the verdict on it. Never write to either side.

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — in sync; nothing would push.
- `⚠️` — drift: N objects would push, Boards' state was moved by hand, or the
  item's **description** was edited on Boards since the last push. None is an
  error, but all are the reason someone ran
  this. **Say which**, since the three call for different things: a pending push
  is routine, a moved state is usually someone else's automation, and an edited
  description means a person wrote something that the next push replaces.
- `⏸` — no config, or the spec is not linked. Nothing to compare.

**Fields:** `Tracker` · `Follow-ups` · `Next`

`Tracker` is the drift in one line — what would push, and whether the tracker's
state diverged. `Next` is `/spec-push` when a push is pending, and nothing to
do when it is not.

A **`phases: <mode>`** line names the phase mode that resolved for this spec's
lifecycle bucket, and appears only when it is not the default `subissue`.
`mapping.phases` may be a per-bucket map, so this is the only place the mode a
given spec got is stated. Under **`inline`** the phases live in the spec item's
description rather than as children, so "0 to create" is the expected shape
rather than a sign the phase files failed to parse; under **`deferred`** the
`N phase(s) deferred` line above it says how many are still waiting on
`/spec-next`. Relay both lines as printed.
