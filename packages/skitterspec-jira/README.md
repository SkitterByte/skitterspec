# @skitterbyte/skitterspec-jira

Spec-driven development for Claude Code, with **one-way Jira Cloud sync** — a
superset of [`@skitterbyte/skitterspec`](https://www.npmjs.com/package/@skitterbyte/skitterspec):
the base filesystem workflow plus `/spec-push` · `/spec-status` and the
`spec-sync` CLI. The repo is canonical; Jira is a generated mirror.

Install exactly one distribution — this, the base, or
`@skitterbyte/skitterspec-linear` — never two:

```
npx @skitterbyte/skitterspec-jira init
```

## What the sync is

- A spec is a Jira **issue**; each phase a **subtask**; tasks ride along as a
  live ADF checklist (still a read-only mirror — the repo wins on every push).
- **One-way**: nothing is read back into the repo. A description edited on Jira
  is reported (`spec-sync status`) and replaced on the next push, loudly.
- Descriptions are stored as ADF; the engine converts markdown at the adapter
  boundary and verifies round-trips **by words, not bytes**.
- Workflow moves happen by **transition** — an unreachable status refuses
  loudly and names what is available; the engine never path-finds a workflow.

## Setup

`/spec-jira-setup` interviews you and writes `specs/.core/jira.config.json`
(site URL, project key, issue/subtask types, bucket→status names). Credentials
are an email + API token pair, kept out of the repo:

```
skitterspec-jira spec-sync credentials set
```

`skitterspec-jira spec-sync doctor --check-remote` reports readiness across
every layer.

Not yet shipped for Jira (the Linear superset has them): assignment/`/spec-claim`,
`retarget`, `reattach`, `spec-sanitise`. Releases and deploys are the host
project's to record on every provider: `spec-sync released <range> --json`
lists a range's tickets for its CI to act on.

This package's `bin/`, `src/` and `assets/` are composed at build time from the
skitterspec monorepo — see the repo for sources and development.
