# @skitterbyte/skitterspec-azure-boards

Spec-driven development for Claude Code, with **one-way Azure Boards sync** — a
superset of [`@skitterbyte/skitterspec`](https://www.npmjs.com/package/@skitterbyte/skitterspec):
the base filesystem workflow plus `/spec-push` · `/spec-status` · `/spec-list` · `/spec-claim`
and the `spec-sync` CLI. The repo is canonical; Azure Boards is a generated
mirror.

Install exactly one distribution — this, the base, or one other superset —
never two:

```
npx @skitterbyte/skitterspec-azure-boards init
```

## What the sync is

- A spec is a **work item**; each phase a **child work item** under a
  parent/child link; tasks ride along as a markdown checklist in the body
  (still a read-only mirror — the repo wins on every push).
- **Descriptions are markdown**, written verbatim with the format declared on
  the field — checkboxes render natively, and a read-back is byte-comparable.
- **Work item types and states are the project's own.** The process template
  (Basic, Agile, custom) decides them, so the config names the types and the
  bucket→state map, validated against the process at run time.
- **One-way**: nothing is read back into the repo. A body edited in Boards is
  reported and replaced on the next push, loudly.
- **Releases**: CI runs `spec-sync release create <tag>` on a tag push. It
  mints one work item of `releases.workItemType` per release, holding exactly
  the tickets that tag contains by their `Refs: AB#n` trailers;
  `release deployed <tag> <env>` moves that item's state through your envs.
- **Assignment**: `/spec-start` assigns the work item to you; `/spec-claim`
  hands it on. Identity derives from the PAT (`spec-sync whoami`).
- **Intake**: adopt a PM-filed work item as a spec's own, routed to `/spec`,
  `/spec-bug` or `/spec-hotfix` by its tags, the original description preserved
  as a comment before the spec replaces it.

## Setup

You need a PAT with **Work Items (Read & Write)** — add **Identity (Read)** for
user search. `/spec-azure-setup` interviews you and writes
`specs/.core/azure-boards.config.json` (org URL, project, types, bucket→state
map). Keep the token out of the repo — export `AZURE_DEVOPS_EXT_PAT`, or:

```
skitterspec-azure-boards spec-sync credentials set
```

`skitterspec-azure-boards spec-sync doctor --check-remote` reports readiness
across every layer, the identity scope included.

Not yet shipped for Azure Boards: `retarget`, `reattach`, `stage`,
`spec-sanitise`.

This package's `bin/`, `src/` and `assets/` are composed at build time from the
skitterspec monorepo — see the repo for sources and development.
