---
github_issue_id: "#99"
---

# Phase 6 — Follow-up: skitterspec service as an always-on projection (design) ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a written design for an opt-in hosted service, agreed before anything
is built. It is a design phase on purpose: the build is a product decision, and
will almost certainly be its own spec in its own repo.

## Context (agreed 2026-11-03)

- **The one thing a service gives that the CLI can't: it is always on and
  sees every branch.** A CLI sees board changes only when someone happens to run
  a skill, which is why that sync fell to one dev.
- **A projection, not a store.** Content lives in the repo and status/people in
  the tracker (phases 1–4). The service holds neither: it is derived from both,
  routes events between them, and can be wiped and rebuilt without loss. This is
  what stops it becoming the third source of truth this spec set out to remove.
- **Rejected:** replacing the tracker (teams won't leave Jira or Linear, which is
  why there are four providers); holding spec content (it would have to model
  branches, which is git again).
- **Cost:** skitterspec is currently zero-infra, offline and sends nothing to a
  third party (compare the `review.reviewers` stance). A service changes that for
  everything it touches, so it is opt-in and never required.

- **Native automations, weighed 2026-11-06** (PR-mode design conversation):
  letting trackers derive status from branch/PR/merge events instead of
  transition pushes. It fails for rc-flows — a merge into the rc is not a
  release, so complete-on-merge must stay off (LSC, Azure). Weigh it here
  per flow, not as a replacement for decision 4.

## Candidate capabilities

- Tracker webhooks: a board Cancelled reaches the branch owner's next session
  (and tears down what can be done remotely).
- A team-wide in-flight index from pushed branches (`feat-in-flight-status`
  across machines).
- Handoff: who is working where, and what is pushed (builds on phase 5).
- A hosted review store: the `remote` tier's verdict reaches the waiting session
  without `/spec-reviewed`.

## Tasks

- [x] Write the design: event model (webhooks in, notifications out), what is
      indexed and from where, auth (git host and tracker OAuth), data retention,
      and what is sent off-machine per capability.
- [x] Decide the session channel: how an event reaches a local Claude session
      (poll on skill run, push notification, or both). *Proposed: D2.*
- [x] Decide the hosting model and whether it lives in this repo. *Proposed:
      D5.*
- [x] Review the design on the page and record the decisions in this spec's
      Changelog. If it goes ahead, `/spec` the build as its own spec.

## Open questions

- [x] Hosted by skitterbyte, or self-hostable first? *Proposed: self-hostable
      first (D5).*
- [x] Does the hosted review store replace the artifact-published `remote` tier,
      or sit beside it? *Proposed: beside it (D4).*

## Design (proposed 2026-11-07)

**How to answer it.** D1–D7 are proposals. A committing verdict on this
phase's page accepts them as written. A note against one reopens that one
alone.

### Shape

A **projector**. It receives events from the git host and the tracker, keeps a
derived index, and answers the CLI when a skill asks. It holds no spec content
and no status of its own. The index can be dropped and rebuilt by a full rescan
of the two sources plus one CLI re-registration (D1), and webhooks only make
that rescan unnecessary.
Nothing reads the service as the truth about anything. When it is down,
unconfigured or unreachable, every skill behaves exactly as it does today,
which is the cannot-tell branch `negative-checks.md` already routes to silence.

### D1 — Event model: normalise at the edge, decide with shared code

**In.** One webhook receiver per source, each normalised to one event shape:

| Source | Hook | Normalised to |
|--------|------|---------------|
| GitHub | `issues`, `projects_v2_item`, `push`, `pull_request` | `board.state` · `board.assignee` · `branch.pushed` · `branch.deleted` · `pr.merged` |
| Linear | `Issue` webhook | `board.state` · `board.assignee` |
| Jira | `jira:issue_updated` | `board.state` · `board.assignee` |
| Azure Boards / Repos | service hooks `workitem.updated`, `git.push`, `git.pullrequest.merged` | all five |

`{ repo, spec, kind, bucket?, assignee?, branch?, sha?, at, actor }` is the
whole event. Nothing else is kept.

**Mapping a ticket to a spec is registered by the CLI**, because only the repo
knows it. It lives in the spec's frontmatter stamp, and the pushed description
drops the header block (`buildDescription` keeps only the title and the `##`
sections). Whenever a push links or stamps a spec, it also posts
`{ ticket, spec }`, and `spec-sync linked --json` posted whole is the rebuild.
Reading the stamp off the base branch instead would need contents access to the
repo, which D6 avoids. **Mapping a branch to a spec** uses the project's committed
`branch.pattern` (read once from `env.config.json` at install), so the service
needs no branch contents.

**Deciding** uses the same functions the CLI uses. `boardDisagreement`,
`readStatus`'s bucket mapping and the state tables come from `provider-kit`
and the provider configs as a dependency, so the service and `spec-sync board`
can never give different answers about one ticket. Reimplementing them would
be how the two drift.

**Out.** The service never acts on git or the tracker. A board Cancelled is
**reported** to whoever holds the branch, and the cleanup stays named and never
offered. That is phase 3's rule, and it holds just as firmly server-side.
*Rejected:* "tear down what can be done remotely" (deleting the remote branch,
closing the PR). A webhook is not an operator, and deleting a branch is the
destructive branch of a check that often cannot tell (a Cancelled that is
reopened an hour later).

### D2 — Session channel: poll on skill run; push only where a wait already runs

- **Poll on skill run.** `spec-sync board` (which `/spec-start`, `/spec-next`
  and `/spec-status` already call) asks the service first, and falls back to
  its own `readStatus` read. The service answers instantly from its index, and
  across every spec on the machine with one call. Nothing new runs locally.
- **Push only into `review wait`.** That command is the one place a session is
  already blocked on an outside event. With the hosted review store (D4) it
  subscribes to the service as well as the local pending store.
- *Rejected:* push notifications into idle sessions. An event that arrives
  while no conversation is running has nowhere to land except an OS
  notification, and the next skill run's poll reaches the same person at the
  moment they can act. An OS notification can come later, as its own opt-in.

### D3 — The index: the tracker and the git host, never the repo's files

| Field | From | Note |
|-------|------|------|
| ticket, board bucket, assignee | tracker | the fields `pull` gave the tracker |
| phase progress | tracker sub-issue states | phases stay `push`, so the board already has them |
| branch, head sha, pushed-at | git host | only branches that were pushed, as in phase 5 |
| handoff note | tracker comment | written by `spec-env handoff` |

That is the team-wide in-flight index (`feat-in-flight-status` across machines)
and the handoff view (phase 5) together. Neither needs the service to read a
spec file.

**Retention.** An index row lives while its spec is live, plus 30 days after the
board finishes it. Raw events are kept for 14 days, for debugging only. A full
rescan rebuilds everything, so dropping any of it loses nothing.

### D4 — Hosted review store: beside the artifact `remote` tier, not instead

`review.remote: "artifact" | "service"`, default `"artifact"`. The artifact
path stays the zero-infra default. Under `"service"`, the published page POSTs
its pass to the service, and `review wait` hears it, so a remote verdict no
longer needs `/spec-reviewed`. When that backend is chosen, the `remote` line's
*"a verdict here needs `/spec-reviewed`"* caveat is dropped, which is an
amendment `spec-reports.md` must record when the build lands.
*Rejected:* replacing the artifact tier. That would make a hosted service
mandatory for reading a review on a phone, which reverses the zero-infra
default this design depends on.

### D5 — Hosting: self-hostable first, in its own repo

- **One container** (or one serverless deploy) that a team runs against its
  own git host and tracker. A skitterbyte-hosted instance is the same code,
  offered later if anyone asks for it. Self-hostable first means no data leaves
  the team's own infrastructure on day one, which is the honest answer to the
  cost named above.
- **Its own repo** (`skitterspec-service`). It depends on `provider-kit` and
  `sync-core` as packages (D1). **This repo gets only the client:** a `service`
  config key (`{ url, tokenEnv }`), the D1 registration on push plus a
  `spec-sync service rebuild` verb, the D2 poll inside `spec-sync board`, the D4
  subscription inside `review wait`, and a `doctor` row.

### D6 — Auth

| Side | Mechanism | Scope |
|------|-----------|-------|
| GitHub | a GitHub App | metadata, issues, projects read, plus `push` / `pull_request` webhooks. No contents |
| Linear | OAuth app | read, webhooks |
| Jira | Atlassian 3LO | `read:jira-work`, webhooks |
| Azure | service hooks + Entra app | work items read, code status read |
| CLI → service | device flow, per machine, per repo | the token resolves like every other one (`tokenEnv`, or the stored credential), never through chat |

### D7 — What leaves the machine, per capability

| Capability | New data off the machine | Already off it? |
|------------|--------------------------|-----------------|
| Ticket ↔ spec registration (D1) | the spec's folder name beside its ticket id | the ticket is; the pairing is not |
| Board → session (D2) | nothing. The service reads the tracker | yes, it is the tracker's |
| In-flight index (D3) | nothing beyond pushed branch names and shas | yes, on the git host |
| Handoff (phase 5) | nothing new | yes, the comment and the pushed branch |
| Hosted review store (D4) | **the rendered diff page and the verdict** | **no**. This is the one real change, so it is opt-in per project, like `review.reviewers` |

### Native automations, per flow

| Flow | Tracker derives status from merges? |
|------|-------------------------------------|
| trunk (`merge --ff-only`) | no, because no PR exists. The transition pushes stay |
| PR to the base branch | yes, it can replace the run-2 complete push |
| PR into an rc branch | no, because a merge into the rc is not a release. Keep complete-on-merge off |

So the service does not replace decision 4. Where a flow allows it, the service
can **observe** `pr.merged` and report a run 2 that never happened (merged on
the host, yet still `in-progress` here). That is a disagreement, so phase 3's
rule applies: report it, and never act on it.

### If it goes ahead

`/spec` the build as its own spec, scoped to the client half above. The
service half belongs to its own repo. That repo's first phase is the D1
receiver plus the D3 rescan for one provider (GitHub), and nothing else.
