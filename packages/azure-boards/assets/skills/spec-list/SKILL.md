---
name: spec-list
description: List every spec Azure Boards holds — id, title, state, and the local spec folder name to paste into /spec-start. Read-only, and it starts nothing. Falls back to the repo's own listing when Azure is unreachable. Opt-in — needs specs/.core/azure-boards.config.json. Use when the user says "/spec-list", "what specs are there", "what is in the backlog", or "list specs from Boards".
disable-model-invocation: true
---

# /spec-list — every spec Azure Boards holds

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

Read-only. It answers a question and writes nothing — no branch, no folder move,
no Boards write.

Why ask Boards rather than `ls specs/`? Because `/spec-start` moves a spec to
`specs/in-progress/` **on that spec's own branch**. On the base branch an
in-flight spec still reads `backlog`, and a teammate's unlanded spec is not on
disk at all. Boards knows what is actually in progress; the repo knows what each
work item is **called on disk**. The listing joins the two.

**Opt-in**: only runs when `specs/.core/azure-boards.config.json` exists. If
absent, tell the user how to enable Azure Boards sync (`/spec-azure-setup`) and
stop.

## 1. Turn the question into flags

The user asks in plain language; the engine takes flags. Map, then run:

| They ask | Flags |
|----------|-------|
| "what specs are there", "/spec-list" | *(none — the live default)* |
| "what's done", "everything" | `--all` |
| "what's cancelled", a named state | `--state "<name>"` (repeatable) |

The default scope is **live** — everything whose state is not what
`config.states` maps `complete` and `cancelled` to. It is deliberately not
everything: in a project with any history, Done dwarfs the rows anyone wanted.

`--state` and `--all` are **alternatives**, and the engine refuses the pair
rather than letting one win silently.

The Linear provider's `--mine`, `--by` and `--next` filters are
**not yet shipped for the Azure Boards provider** — assignee filtering and
backlog ordering wait on phase 4's assignment support. Say so when one is asked
for, rather than approximating it.

## 2. Run the engine

```
skitterspec spec-sync list [--state <name> …|--all] [--json]
```

- **`transport = api`** (a PAT resolves) → it queried Boards and printed the
  listing. **Relay its output verbatim** and stop. Do not re-format it and do not
  make Azure calls of your own — the engine already joined the local spec
  folders on.
- **`transport = mcp`** → the engine made no call. Go to step 3.
- Anything else it prints on one `spec-sync list:` line is a **degradation**, not
  a crash — go to step 4.

## 3. The MCP path

Only when the engine said `transport = mcp`. Discover the **query** tool at
runtime the way `/spec-push` describes (`wit_query`, running WIQL). If Azure
isn't connected or the tool is missing, go to step 4 — do not stop with nothing.

Then build one WIQL query per run:

- **Scope by state.** The live default is
  `[System.TeamProject] = @project AND [System.WorkItemType] = '<azure.workItemType>'
  AND NOT [System.State] IN ('<complete>', '<cancelled>')`
  with the names from `config.states`; `--state` substitutes the named
  state(s); `--all` drops the state clause entirely.
- **Filter to the spec type in the query** — the `[System.WorkItemType]` clause
  above. A spec is the configured parent type; a phase is a child of
  `azure.childType`, and a listing that includes children buries the specs.
- **Ask for the fields you print** — `System.Title` and `System.State`; the id
  rides on every result, and the url is
  `<orgUrl>/<project>/_workitems/edit/<id>`.
- **Page, and never cap silently.** Follow the tool's pagination until it runs
  out. If you stop early, say so on its own line and say what you stopped at.

**The current phase, on in-progress rows only.** For each row whose state is
the in-progress one, query again with `[System.Parent] = <id>` and the same
fields. Order the children by **id**, numerically — children are minted in
phase order, so the id carries it. Print the live one as `2/5 — <title>`. Three
shapes, none of them guessed at:

- **No child in progress** — print nothing extra. A spec sits between phases all
  the time; that is not a missing phase.
- **More than one** — print the lowest-numbered, then append
  `(+N more in progress)`. Two people on one spec is real, not an error.
- **`mapping.phases` is `inline` for this spec's bucket** — skip the call
  entirely. Those phases live in the spec item's own description, so there are
  no children, and asking would report "no phase in progress" for a spec that is
  mid-build.

Do **not** make this call for backlog, done or cancelled rows — one lookup per
in-progress row is the budget, and there are rarely many.

Then join locally — no second Azure call:

```
skitterspec spec-sync linked --json
```

That is `[{ spec, bucket, identifier }]`. Key it by `identifier` and attach each
item's local `spec` folder name. Format the rows exactly as the API path does
(step 5), including the `showing N of M` count.

## 4. Degrade — never leave them with nothing

Azure unreachable, no credential, no MCP tool, an Azure error: **do not stop**.
Print the local listing instead:

```
skitterspec spec-sync linked --json
```

Show `spec`, `bucket` and `identifier`, under a one-line banner naming what is
missing and why it may be wrong:

```
Azure Boards unreachable (<reason>) — this is the repo's own listing.
Buckets are this branch's; a spec someone else has started still reads "backlog" here.
```

That caveat is the point of the banner. A local bucket is not evidence of a
spec's real state — it is evidence of what this branch knows, which is exactly
what the command exists to go beyond. A query command that fails closed is one
people stop typing.

## 5. Report

Relay the listing. Whatever the path, three things must survive into what the
user reads:

- **The count, as `showing N of M`.** If they are not the same number, say what
  was left out and how to see it.
- **The phase, on in-progress rows** — `2/5 — <title>`, after the state.
- **A row with no local match stays in**, marked `— (not linked here)`. It is not
  noise: a teammate's unlanded spec, or one authored inside another spec's
  worktree, is precisely what the repo could not have told them.

Finish with the hand-off, because every row carries the folder name for it —
as a sentence, not a fenced block: say that `/spec-start <name>` starts any of
them, with the name copied from a row.

**Never start it yourself.** `/spec-start` provisions a branch, moves a folder
and commits, and it has dirty-tree refusals this skill does not reproduce.
Offering the name is the whole job.

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**The listing goes above the block, unflattened.** It is rows of other people's
work; the block is the verdict on this run of the query. Do not fold the listing
into fields, and do not repeat it there.

**Verdicts**

- `✅` — the listing is Boards', joined to the local folder names.
- `⚠️` — listed, with a caveat that changes how the rows read: a paging cap you
  stopped at, or the local fallback listing under its banner.
- `⏸` — refused before acting: no config, so there is nothing to list against.
- `❌` — the query was wrong: `--state` and `--all` together, or a state name
  Azure rejects.

**Fields:** `Follow-ups` · `Next`

**No `Tracker` row.** This skill names many specs and owns none, so an id row
would have to pick one. The counts — `showing N of M` — belong to the listing
above, where the engine already prints them.

`Next` is the hand-off: `/spec-start <name>`, with a name copied from a row.
