---
name: spec-list
description: List every spec Linear holds — id, title, workflow state, who holds it, and the local spec folder name to paste into /spec-start. Read-only, and it starts nothing. Falls back to the repo's own listing when Linear is unreachable. Opt-in — needs specs/.core/linear.config.json. Use when the user says "/spec-list", "what specs are there", "what is in the backlog", "what is Jane working on", or "list specs from Linear".
disable-model-invocation: true
---

# /spec-list — every spec Linear holds

Read-only. It answers a question and writes nothing — no branch, no folder move,
no Linear write.

Why ask Linear rather than `ls specs/`? Because `/spec-start` moves a spec to
`specs/in-progress/` **on that spec's own branch**. On the base branch an
in-flight spec still reads `backlog`, and a teammate's unlanded spec is not on
disk at all. Linear knows what is actually in progress and who holds it; the repo
knows what each issue is **called on disk**. The listing joins the two.

**Opt-in**: only runs when `specs/.core/linear.config.json` exists. If absent,
tell the user how to enable Linear sync (`/spec-linear-setup`) and stop.

## 1. Turn the question into flags

The user asks in plain language; the engine takes flags. Map, then run:

| They ask | Flags |
|----------|-------|
| "what specs are there", "/spec-list" | *(none — the live default)* |
| "what's done", "everything" | `--all` |
| "what's cancelled", a named state | `--state "<name>"` (repeatable) |
| "what's next", "the next few in the backlog" | `--next N` |
| "what am I on", "assigned to me" | `--mine` |
| "what is Jane on", "Jane's specs" | `--by "Jane"` |
| "what's in flight", "what's being worked on" | `--in-progress` |
| "just the first few" | `--limit N` |
| "include the archived ones" | `--archived` |

The default scope is **live** — whatever `config.states` maps `backlog` and
`in-progress` to. It is deliberately not everything: in a workspace with any
history, Done dwarfs the rows anyone wanted.

`--mine` and `--by` filter by assignee and stack with any one scope flag —
`--next 5 --mine` and `--in-progress --by "Jane"` both read naturally. The scope
flags themselves (`--state`, `--all`, `--next`, `--in-progress`) are
**alternatives**, and the engine refuses any two of them rather than letting one
win silently.

`--next N` is **backlog-only and ordered**, so it does not combine with
`--state` or `--all`; the engine refuses that pair rather than picking a winner.
It reproduces Linear's own Backlog order — priority first, then the manual
drag-order — and when nothing is prioritised it says so, because that order is
then a person's arrangement rather than a ranking.

## 2. Run the engine

```
skitterspec spec-sync list [--state <name> …|--all] [--limit N] [--archived] [--json]
```

- **`transport = api`** (a key is set) → it queried Linear and printed the
  listing. **Relay its output verbatim** and stop. Do not re-format it and do not
  make Linear calls of your own — the engine already joined the local spec
  folders on.
- **`transport = mcp`** → the engine made no call. Go to step 3.
- Anything else it prints on one `spec-sync list:` line is a **degradation**, not
  a crash — go to step 4.

**These two failures are not the same, and the engine says so.**
Relay the difference rather than flattening it. `--mine` when nobody can say
who you are (a shared or bot key, an offline machine) is an ordinary state: it
prints one line, lists nothing and exits 0. `--by "someone"` that matches no
user, or matches several, is a wrong argument: it lists the candidates or says
there are none, and exits non-zero. Neither ever falls back to the whole team —
a heading promising one person's work over everyone's is the failure both are
written to avoid.

## 3. The MCP path

Only when the engine said `transport = mcp`. Discover the issue **list** tool at
runtime the way `/spec-push` describes (`list_issues`). If Linear isn't connected
or the tool is missing, go to step 4 — do not stop with nothing.

Then, per state you are listing:

- **One call per state.** The tool's `state` takes a single state name, not a
  list, so the live default is **two** calls (`backlog` and `in-progress` from
  `config.states`). Merge the results and de-duplicate by identifier.
- **Ask for the fields you print** — `fields: ["title", "status", "assignee",
  "url", "parentId"]`. `parentId` is not optional: it is the discriminator in the
  next bullet, and it is absent from the default response.
- **Filter out phase sub-issues yourself.** The tool can filter *to* a parent
  (`parentId`) but has no "parentless" filter, so **you** must drop every issue
  that came back carrying a `parentId`. A spec issue has none; a phase sub-issue
  does.
- **Page, and never cap silently.** `limit` defaults to 50 and maxes at 250;
  follow `cursor` until it runs out. If you stop early, say so on its own line
  and say what you stopped at.
- Pass `includeArchived` only when the user asked for `--archived`.
- **Assignee needs no identity lookup here.** The tool takes `assignee` as a
  user id, name, email **or the literal `"me"`** — so `--mine` is
  `assignee: "me"` and `--by "Jane"` is `assignee: "Jane"`. Do **not** call
  `spec-sync whoami` on this path; it exists for the API path, which needs an
  id. If the name matches nobody, say so and list nothing.

**`--next` cannot be fully reproduced over MCP, and you must say so.** The tool
returns `priority` as a field, so order by that; but `sortOrder` — Linear's
manual drag-order — is **not among the fields it can return** at all, and its
`orderBy` offers only `createdAt` and `updatedAt`. So within one priority you
are printing Linear's default order, not the Backlog order. Say that on its own
line rather than letting the rows imply an order they do not have:

```
sortOrder is unavailable over MCP — within a priority these are in Linear's
default order, not the Backlog drag-order. Set a Linear API key for the real one.
```

**The current phase, on in-progress rows only.** For each row whose state is the
in-progress one, call the list tool again with `parentId` set to that issue and
`fields: ["title", "status"]`. Order the children by **identifier**, numerically
— `sortOrder` is unavailable here for the same reason it is under `--next`, and
sub-issues are minted in phase order, so the identifier carries it. Print the
live one as `2/5 — <title>`. Three shapes, none of them guessed at:

- **No child in progress** — print nothing extra. A spec sits between phases all
  the time; that is not a missing phase.
- **More than one** — print the lowest-numbered, then append
  `(+N more in progress)`. Two people on one spec is real, not an error.
- **`mapping.phases` is `inline` for this spec's bucket** — skip the call
  entirely. Those phases live in the spec issue's own description, so there are
  no children, and asking would report "no phase in progress" for a spec that is
  mid-build.

Do **not** make this call for backlog, done or cancelled rows — one lookup per
in-progress row is the budget, and there are rarely many.

Then join locally — no second Linear call:

```
skitterspec spec-sync linked --json
```

That is `[{ spec, bucket, identifier }]`. Key it by `identifier` and attach each
issue's local `spec` folder name. Format the rows exactly as the API path does
(step 5), including the archived-exclusion line and the `showing N of M` count.

## 4. Degrade — never leave them with nothing

Linear unreachable, no credential, no MCP tool, a Linear error: **do not stop**.
Print the local listing instead:

```
skitterspec spec-sync linked --json
```

Show `spec`, `bucket` and `identifier`, under a one-line banner naming what is
missing and why it may be wrong:

```
Linear unreachable (<reason>) — this is the repo's own listing.
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
- **The archived line.** Excluded by default, and said so — a blind spot named
  rather than left to be discovered.
- **The phase, on in-progress rows** — `2/5 — <title>`, after the assignee.
- **A row with no local match stays in**, marked `— (not linked here)`. It is not
  noise: a teammate's unlanded spec, or one authored inside another spec's
  worktree, is precisely what the repo could not have told them.

Finish with the hand-off, because every row carries the folder name for it:

```
start one with: /spec-start <name>
```

**Never start it yourself.** `/spec-start` provisions a branch, moves a folder
and commits, and it has dirty-tree refusals this skill does not reproduce.
Offering the name is the whole job.
