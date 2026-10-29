# @skitterbyte/skitterspec-github

Spec-driven development for Claude Code, with **one-way GitHub sync** — a
superset of [`@skitterbyte/skitterspec`](https://www.npmjs.com/package/@skitterbyte/skitterspec):
the base filesystem workflow plus `/spec-push` · `/spec-status` · `/spec-list` · `/spec-claim`
and the `spec-sync` CLI. The repo is canonical; GitHub is a generated mirror.

Install exactly one distribution — this, the base, or one other superset —
never two:

```
npx @skitterbyte/skitterspec-github init
```

## What the sync is

- A spec is a GitHub **issue**; each phase a **sub-issue**; tasks ride along as
  a task list in the body (still a read-only mirror — the repo wins on every
  push).
- **Workflow state lives on a Projects v2 board.** An issue is only open or
  closed, so each lifecycle bucket maps to an option of the board's `Status`
  field; `complete` and `cancelled` also close the issue (`completed` /
  `not_planned`). The board is required — one per repo.
- **One-way**: nothing is read back into the repo, and skitterspec tells the
  board only about its own transitions — a card moved by hand is left alone. A
  body edited on GitHub — a ticked box included — is reported and replaced on
  the next push, loudly.
- **Releases are yours to record**: `spec-sync released <range> --json` lists
  exactly the issues a range contains, by their `Refs: #N` trailers, each with
  its spec and url. Your CI pipes that into whatever records a release or a
  deploy; skitterspec writes neither.
- **Assignment**: `/spec-start` assigns the issue to your login; `/spec-claim`
  hands it on. Only collaborators can be assigned, and that is checked before
  anything is written.
- **Intake**: `spec-sync intake` lists issues waiting to become specs, routed
  to `/spec`, `/spec-bug` or `/spec-hotfix` by label.

## Setup

Everything here is free on a personal account. You need a Projects v2 board
and a **classic** token with the `repo` and `project` scopes. `/spec-github-setup`
interviews you and writes `specs/.core/github.config.json` (owner, repo, board
number, bucket→Status options). Keep the token out of the repo — export
`GITHUB_TOKEN`, or:

```
skitterspec-github spec-sync credentials set
```

`skitterspec-github spec-sync doctor --check-remote` reports readiness across
every layer, token scopes included.

Not yet shipped for GitHub: `retarget`, `reattach`, `spec-sanitise`.

This package's `bin/`, `src/` and `assets/` are composed at build time from the
skitterspec monorepo — see the repo for sources and development.
