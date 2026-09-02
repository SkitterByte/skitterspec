---
name: spec-sync
description: Run the repo-wide spec-sync operations against Linear — what's linked, the workspace's states and projects, read-back verification, manual stamping, and bulk `apply --all <bucket>`. Run it bare for the repo-wide overview. Wraps the `spec-sync` CLI, which is a local devDependency and never on PATH, so this skill always states the full invocation. Defers to /spec-push and /spec-status for per-spec work. Opt-in — needs specs/.core/linear.config.json. Use when the user says "/spec-sync", "run spec-sync", "what's linked to Linear", "which states does the workspace have", or "mirror the whole backlog".
---

# /spec-sync — the repo-wide Linear sync operations

`/spec-push` and `/spec-status` cover **one spec**. This skill covers everything
**repo-wide**, and is the answer to a bare "run spec-sync" — which is not itself
a command.

**Opt-in**: only runs when `specs/.core/linear.config.json` exists. If absent,
tell the user how to enable Linear sync and stop.

## The invocation — always state it

`spec-sync` is a subcommand of a binary that is a **local devDependency**, so it
is never on `PATH`. Typing `spec-sync` gives `command not found`, which reads as
a broken install rather than a wrong invocation. Always run it — and always show
the user you ran it — in full:

```
pnpm exec skitterspec-linear spec-sync <subcommand> [args]
```

In a project that installs the Linear superset the binary is
`skitterspec-linear` (it also answers to `skitterspec`). Never print a bare
`spec-sync …` as if the user could type it.

## 1. Route the ask

| The user asks | Run |
|---------------|-----|
| bare `/spec-sync`, "what's linked?", "how much is mirrored?" | `linked` |
| "what states / projects does the workspace have?" | `states`, `projects` |
| "did the mirror survive the push?" | `verify <spec> --stored <file>` |
| "link this spec to KEY-1 by hand" | `stamp <spec> --issue KEY-1` |
| "mirror the whole backlog / every complete spec" | `apply --all <bucket>` — **confirm first** |
| push one spec, or "what would push?" | **defer** — see below |

**With no argument, run `linked`.** It is the repo-wide overview, it is
read-only, and it is what a bare "run spec-sync" means.

**When the ask is genuinely ambiguous between a read and a write — ask.**
"Sync the backlog" could mean `linked` (show me) or `apply --all backlog`
(write dozens of issues). Never resolve that guess in favour of the write.

## 2. Defer, don't duplicate

Two front doors to one write path is worse than none:

- **Push one spec** → `/spec-push`. It owns the transport choice, the
  workspace-state gate, the plan, the apply, the stamping and the snapshot.
- **Per-spec drift** ("is this spec in sync?", "what would push?") →
  `/spec-status`.

Say which skill you're handing to and stop; don't reimplement either.

## 3. The read-only subcommands

```
pnpm exec skitterspec-linear spec-sync linked [--json]
pnpm exec skitterspec-linear spec-sync states [--via api|mcp] [--json]
pnpm exec skitterspec-linear spec-sync projects [--via api|mcp] [--json]
```

- **`linked`** is offline: which specs carry a `linear_identifier`, their bucket,
  and an `N/M linked` total. Relay it, and when specs in `in-progress` have no
  issue, say so — those are the ones a push would mint.
- **`states` / `projects`** reach the workspace. `states` also reports the
  **transport** (`api` when a key is set, else `mcp`), which is the honest way to
  answer "how is this talking to Linear?".

## 4. `verify` — check what the tracker actually stored

```
pnpm exec skitterspec-linear spec-sync verify <spec> --stored <file>
```

`--stored` is **what Linear currently holds**, read back over MCP:

```json
{ "issue": "…", "subIssues": { "01-engine": "…" } }
```

**It is not a `linear-base/*.base.json` snapshot.** That file holds content
*hashes* keyed by identifier; comparing one against a description reports
enormous losses on a perfectly intact mirror. The engine refuses a snapshot
outright — if you see that refusal, you passed the wrong file, not found a bug.

Warns, never fails. The repo is the source of truth; a mangled mirror is fixed
by pushing again.

## 5. `stamp` — the manual escape hatch

```
pnpm exec skitterspec-linear spec-sync stamp <spec> --issue KEY-1 [--url URL] [--sub <ref>=KEY-2 …]
```

Writes the ids into the spec's frontmatter without touching Linear. For adopting
an issue created by hand, or repairing a stamp — not the normal path, which is
`/spec-push`. A wrong id here makes the next push see an **unlinked** spec and
mint a duplicate, so read the values back to the user before writing.

## 6. `apply --all <bucket>` — bulk, and the one with real blast radius

```
pnpm exec skitterspec-linear spec-sync apply --all <bucket> [--via api|mcp] [--json]
```

**Confirm before running, and state creates and updates separately.** They are
not the same risk:

- an **update** refreshes a mirror that already exists;
- a **create** mints new issues and sub-issues in someone's shared tracker.

A repo adopting Linear reports "N to create" for every unlinked spec, so an
unconsidered `--all` can mint dozens of sub-issues. Get the counts first — run
`linked` to see what is unlinked, or `spec-sync push <spec>` per spec for exact
numbers — then show the user something like:

```
apply --all backlog would:
  create  12 issue(s) + 34 sub-issue(s)   ← new objects in Linear
  update   3 issue(s) +  5 sub-issue(s)   ← refresh existing mirrors
```

Only run it on an explicit yes. It is resumable: every id is stamped the moment
its object exists, so an interrupted run continues rather than duplicating.

`--all` refuses over MCP by design — bulk goes through the API path.

## 7. Report

Relay the engine's output. Name the subcommand you ran, in full, so the user can
re-run it themselves. For anything that wrote, say what changed in Linear and
that the repo is unchanged — it is the source of truth either way.
