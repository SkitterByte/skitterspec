---
github_identifier: "#341"
github_url: "https://github.com/SkitterByte/skitterspec/issues/341"
---

# One live workbench: drop Docker stacks, snapshot the database, retire connect

> **Type:** Epic
> **Name:** epic-live-workbench (the spec folder name — the handle you paste into `/spec-start`)
> **Author:** Reuben Greaves
> **Raised:** 2026-11-27
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/341
> **Area:** packages/common/src/env/{live,provision,teardown,prune,resolve,registry,config,proxy,dev}.js, packages/common/src/cli.js, packages/common/assets
> **Lanes:** 1
> **Docs:** none: an epic holds no code; each member names its own pages

## Summary

skitterspec gets one way to try a spec on localhost: `/spec-live`. Per-spec
Docker stacks and `/spec-connect` go away. A branch that changes migrations
can go live against your dev database because the database is snapshotted
first and restored on release.

## Problem

There are two ways to try a spec on localhost, and neither handles a branch
with database changes well. `/spec-connect` was meant to cover stateful specs
through a per-spec Docker stack. That path never worked well and costs a lot:
compose files, port slots, `.env` rendering, volume backups at teardown.
`/spec-live` refuses migrations outright, or under `live-confirm` changes the
shared database with no way back. Under PR landing there is no `/spec-land`,
so a developer who is happy to run a branch's migrations in order to test it
has nothing to use.

## Acceptance criteria

- No skitterspec command creates, starts or tears down a Docker stack.
- A project with `live.refusedReach: "snapshot"` can `/spec-live` a migrations
  branch. `/spec-live off` puts the database back as it was before the take.
- `/spec-connect` is gone, and every message that named it names `/spec-live`
  or the spec's own dev ports instead.
- Existing configs and specs that mention Docker or connect keep working, with
  a deprecation notice.

## Decisions

1. **Drop Docker before adding the snapshot.** The snapshot work never has to
   account for `Stack: worktree + docker`. The connect retirement is then
   designed with no Docker left to route to.
2. **Retire connect last.** Once Docker is gone, connect's only difference is
   which process serves the code, and once live can snapshot it covers the
   database too. Connect is only safe to remove after both.
3. **One lane.** Members 1 and 2 both edit `live.js` and `config.js`, and
   member 3 waits on both.
4. **`/spec-land` stays trunk-only.** Under PR landing, putting unreviewed
   work on the base is what PR mode exists to prevent. "Run it on my dev
   server" is a live job.
5. **Supersedes `feat-connect-planner` (#17).** That spec adds a planner to a
   verb this epic removes, so it is cancelled when `feat-drop-spec-connect`
   starts.

## Members

Progress is the members'. `skitterspec epic status epic-live-workbench`
derives the order from their `Waits on:` headers.

- `feat-drop-docker-stacks`
- `feat-live-db-snapshot` (waits on feat-drop-docker-stacks)
- `feat-drop-spec-connect` (waits on both)

## Open questions

- None

## Changelog

- 2026-11-27 — Spec created. It grew out of "live with migrations under PR
  landing", widened when the Docker stacks were dropped.
