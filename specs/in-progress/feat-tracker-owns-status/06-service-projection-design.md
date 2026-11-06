---
github_issue_id: "#99"
---

# Phase 6 — Follow-up: skitterspec service as an always-on projection (design) ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

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

- [ ] Write the design: event model (webhooks in, notifications out), what is
      indexed and from where, auth (git host and tracker OAuth), data retention,
      and what is sent off-machine per capability.
- [ ] Decide the session channel: how an event reaches a local Claude session
      (poll on skill run, push notification, or both).
- [ ] Decide the hosting model and whether it lives in this repo.
- [ ] Review the design on the page and record the decisions in this spec's
      Changelog. If it goes ahead, `/spec` the build as its own spec.

## Open questions

- [ ] Hosted by skitterbyte, or self-hostable first?
- [ ] Does the hosted review store replace the artifact-published `remote` tier,
      or sit beside it?
