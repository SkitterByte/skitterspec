---
name: spec-sync
description: Run the repo-wide spec-sync operations against Azure Boards — what is linked, the types' states, read-back verification, manual stamping, and bulk apply. Run it bare for the repo-wide overview. Defers to /spec-push and /spec-status for per-spec work. Opt-in — needs specs/.core/azure-boards.config.json. Use when the user says "/spec-sync", "run spec-sync", "what's linked to Boards", "which states do the types have", or "mirror the whole backlog".
disable-model-invocation: true
---

# /spec-sync — the repo-wide Azure Boards sync operations

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

`/spec-push` and `/spec-status` cover **one spec**. This skill covers everything
**repo-wide**, and is the answer to a bare "run spec-sync" — which is not itself
a command.

**Opt-in**: only runs when `specs/.core/azure-boards.config.json` exists. If
absent, tell the user how to enable Azure Boards sync and stop.

## The invocation — always state it

`spec-sync` is a subcommand of a binary that is a **local devDependency**, so it
is never on `PATH`. Typing `spec-sync` gives `command not found`, which reads as
a broken install rather than a wrong invocation. Always run it — and always show
the user you ran it — in full:

```
pnpm exec skitterspec-azure-boards spec-sync <subcommand> [args]
```

In a project that installs the Azure Boards superset the binary is
`skitterspec-azure-boards` (it also answers to `skitterspec`). Never print a
bare `spec-sync …` as if the user could type it.

## 1. Route the ask

| The user asks | Run |
|---------------|-----|
| bare `/spec-sync`, "what's linked?", "how much is mirrored?" | `linked` |
| "what states do the types have?" | `states` |
| "what specs are there?", "what's in the backlog?" | `list` — or hand to `/spec-list` |
| "did the mirror survive the push?" | `verify <spec> --stored <file>` |
| "link this spec to AB#1 by hand" | `stamp <spec> --issue AB#1` |
| "mirror the whole backlog / every complete spec" | `apply --all <bucket>` — **confirm first** |
| "what ticket am I on?", writing a commit | `ref` |
| "what shipped in this release?" | `released` — **not yet shipped**, see below |
| "is any of this wired up?", "why isn't sync working?" | `doctor` — scaffold, isolation, tracker and credentials in one |
| "set my Azure PAT", "am I authenticated?" | `credentials <status\|set\|unset>` |
| push one spec, or "what would push?" | **defer** — see below |

The Linear provider's `retarget`, `reattach`, `stage`, `whoami`, `users`,
`assign` and `sanitise` are **not yet shipped for the Azure Boards provider** —
say so when one is asked for, rather than improvising an equivalent.
**`released` is in the same list for now**: it needs the kit's
provider-supplied ref pattern (landing with `feat-github-provider`), and the
engine refuses it with exactly that explanation rather than mis-scanning
`AB#n` refs as unreferenced.

**With no argument, run `linked`.** It is the repo-wide overview, it is
read-only, and it is what a bare "run spec-sync" means.

**When the ask is genuinely ambiguous between a read and a write — ask.**
"Sync the backlog" could mean `linked` (show me) or `apply --all backlog`
(write dozens of work items). Never resolve that guess in favour of the write.

## 2. Defer, don't duplicate

Two front doors to one write path is worse than none:

- **Push one spec** → `/spec-push`. It owns the transport choice, the
  state-name gate, the plan, the apply, the stamping and the snapshot.
- **Per-spec drift** ("is this spec in sync?", "what would push?") →
  `/spec-status`.

Say which skill you're handing to and stop; don't reimplement either.

## 3. The read-only subcommands

```
pnpm exec skitterspec-azure-boards spec-sync linked [--json]
pnpm exec skitterspec-azure-boards spec-sync states [--via api|mcp] [--json]
```

- **`linked`** is offline: which specs carry an `azure_identifier`, their
  bucket, and an `N/M linked` total. Relay it, and when specs in `in-progress`
  have no item, say so — those are the ones a push would mint.
- **`states`** reaches the project. It also reports the **transport** (`api`
  when a PAT resolves, else `mcp`), which is the honest way to answer "how is
  this talking to Azure?". Its non-JSON output ends with the **bucket map** —
  every lifecycle bucket against the types' real states, a verdict per row —
  which is the answer to relay when the user asks whether the mapping is right.
- **`list`** is the read side of the mirror: every spec item Boards holds,
  joined to the local spec folder that owns it. Unlike `linked`, it asks BOARDS
  what exists rather than the repo — which is the only way to see a spec started
  on a branch this checkout has not got. Scope is the live states by default
  (`--all`, or `--state <name>`). **`/spec-list` is the front door** — hand over
  to it for anything beyond a bare listing; it carries the MCP path and the
  offline degradation.

## 4. `verify` — check what the tracker actually stored

```
pnpm exec skitterspec-azure-boards spec-sync verify <spec> --stored <file>
```

`--stored` is **what Boards currently holds**, read back over MCP:

```json
{ "issue": "…", "subIssues": { "01-engine": "…" } }
```

**It is not an `azure-base/*.base.json` snapshot.** That file holds content
*hashes* keyed by identifier; comparing one against a description reports
enormous losses on a perfectly intact mirror. The engine refuses a snapshot
outright — if you see that refusal, you passed the wrong file, not found a bug.

Warns, never fails. The repo is the source of truth; a mangled mirror is fixed
by pushing again. Boards stores markdown verbatim, so the read-back is normally
the pushed text itself; an HTML-era item reduces to text first, and the
comparison is words, not bytes.

## 5. `stamp` — the manual escape hatch

```
pnpm exec skitterspec-azure-boards spec-sync stamp <spec> --issue AB#1 [--url URL] [--sub <ref>=AB#2 …]
```

Writes the ids into the spec's frontmatter without touching Boards (it verifies
them against Boards when a PAT resolves). For adopting an item created by hand,
or repairing a stamp — not the normal path, which is `/spec-push`. A wrong id
here makes the next push see an **unlinked** spec and mint a duplicate, so read
the values back to the user before writing.

## 6. `apply --all <bucket>` — bulk, and the one with real blast radius

```
pnpm exec skitterspec-azure-boards spec-sync apply --all <bucket> [--via api|mcp] [--json]
```

**Confirm before running, and state creates and updates separately.** They are
not the same risk:

- an **update** refreshes a mirror that already exists;
- a **create** mints new work items and children in someone's shared tracker.

A repo adopting Boards reports "N to create" for every unlinked spec, so an
unconsidered `--all` can mint dozens of children. Get the counts first — run
`linked` to see what is unlinked, or `spec-sync plan <spec>` per spec for exact
numbers — then show the user something like:

```
apply --all backlog would:
  create  12 item(s) + 34 child(ren)   ← new objects in Boards
  update   3 item(s) +  5 child(ren)   ← refresh existing mirrors
```

Only run it on an explicit yes. It is resumable: every id is stamped the moment
its object exists, so an interrupted run continues rather than duplicating.

`--all` refuses over MCP by design — bulk goes through the API path.

## 7. `ref` — the ticket in a commit

```
pnpm exec skitterspec-azure-boards spec-sync ref [--json]
```

`ref` prints the ticket for the branch you are on, so a commit can carry
`Refs: AB#<n>` — see `.claude/rules/commit-trailers.md`.
**Off a spec branch, or on a spec that is not linked, it prints nothing and exits non-zero.**
That is the correct answer, not an error to work around: do not invent a ref,
and never write `Refs: none`.

`released` — the range report those trailers feed — is **not yet shipped** for
this provider (see the routing table). The trailers written now are still the
record; the report starts reading them the release the kit seam lands.

## 8. Report

Relay the engine's output **above the block**, and name the subcommand you ran
**in full**, so the user can re-run it themselves.

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — the subcommand did what it says.
- `⚠️` — it ran, with something worth knowing — a partial result, a warning it
  printed, a degradation it fell back to.
- `❌` — it wrote some objects and failed on another. Say what exists now.
- `⏸` — it refused: no config, an unvalidated state list, a bad argument.
  Nothing was written.

**A branch-local bucket is the normal case, never the caveat.** `linked`
reads the checkout it runs in, and an in-flight spec's move to
`in-progress` lives on its own unlanded branch — so from the primary
checkout the spec still reads `backlog` while the tracker (pushed from
the worktree) is ahead. That is worktree mode working as designed:
report it `✅` with the fact in `Notes`. Spending `⚠️` on the normal
case is how the verdict stops meaning anything — the same argument
`spec-reports.md` makes for `Untouched`.

**Fields:** `Tracker` · `Notes` · `Follow-ups` · `Next`

`Tracker` says what changed in Boards **and that the repo is unchanged** — it is
the source of truth either way, and a report that omits the second half reads as
though a sync had edited the repo.
