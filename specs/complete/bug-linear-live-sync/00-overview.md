# Bug: Linear hybrid-sync is broken against the real Linear API

> **Type:** Bug
> **Status:** Complete (2026-07-29)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-07-28
> **Area:** packages/sync-core/src/{normalize,push}.js, packages/linear/src/{config,mcp}.js

## Symptom

The Linear hybrid-sync (`/spec-status`, `/spec-pull`, `/spec-push`) does not work
against the real connected `linear` MCP server. Confirmed live against team
"Skitterspec" (`e07c2b54-…`) by creating a probe project and calling
`get_project`. The remote-facing code was written against a *guessed* Linear
shape and none of it matches:

- **Status / priority / labels never pull.** `normalizeRemote` reads the wrong
  keys/shapes for the real projection (details below).
- **`description` shows as perpetually changed.** Linear reserializes markdown on
  save (authored `-` bullets come back as `*`), so the SHA-1 content hash never
  matches base → false conflicts.
- **Push refuses on the first run** for any spec with a `## Phases` section.

## Root cause

**`packages/sync-core/src/normalize.js` → `normalizeRemote` (five shape misreads):**

| Field | Code reads | Real `get_project` returns |
|-------|-----------|----------------------------|
| workflowState | `p.state` | `p.status` — object `{ name, type }` |
| priority | `p.priority` (scalar) | `{ value, name }` object |
| labels | `p.labels` (strings) | `[{ id, name }]` objects |
| milestone status | `m.status`/`m.state` | milestone only has `progress` (`"0%"`) |
| acceptanceCriteria | `p.acceptanceCriteria` | no such field (lives inside `description`) |

**Idempotency:** `compare.js` hashes each field's content; Linear's markdown
reserialization means `description` never hashes equal to base.

**Structural over-sync (`config.js` + `push.js`):** the default `fieldOwnership`
marks `milestones`/`phaseBodies`/`acceptanceCriteria`/`taskBreakdown` as `both`,
but the live skill only ever writes the project `description`. On a fresh Linear
project these are empty remotely and non-empty locally, so `classify()` returns
`conflict`, and `push.js` treats *any* raw remote-only/conflict field (plus any
`updatedAt` bump) as "remote moved" → push refuses before it can write anything.

The live MCP path runs through the `/spec-*` SKILL.md prose + the file adapter in
`cli-sync.js`; `discoverLinear`/`makeAdapter` in `mcp.js` is reference code (not
on the live path) and its matchers/adapter were likewise never run against real
Linear (they assume `create_`/`update_` verbs; Linear consolidated to `save_*`).

## Failing test (red)

`packages/sync-core/test/sync-normalize-live.test.js` — five assertions driving
`normalizeRemote` with the **real captured** projection: status object → bucket,
priority object → number, label objects → names, milestone `progress` → status,
and a markdown-reserialization idempotency check (`hashField(remote.description)
=== hashField(local.description)`). Run:
`node --test 'packages/sync-core/test/sync-normalize-live.test.js'` — all 5 fail
for the right reasons (reads wrong keys / no canonicalization).

## Fix

Pragmatic slice: make push (content up) + pull (status/priority/labels down) work
and be idempotent. Full spec-body round-trip (milestones/AC/tasks Linear→repo)
stays the known deferred gap.

- [x] `normalize.js`: read `p.status` (object) for workflowState, `p.priority.value`,
      `labels[].name`, milestone `progress`→status; add `canonicalizeMarkdown` and
      apply it to `description` on both local and remote (idempotent hash).
- [x] `config.js`: shrink default `fieldOwnership` to `description` (both) +
      `workflowState`/`priority`/`labels` (pull). Body fields leave the default
      synced set (their text still ships inside `description`).
- [x] `push.js`: `moved` fires only on `both`-owned remote divergence, not any
      field / `updatedAt` bump (a pull-owned Linear edit must not block a push).
- [x] `mcp.js`: matchers recognise `save_*` (upsert); `readProject` passes the
      `query` arg; milestone ops pass `project`; add `createProject`; fix the stale
      "verified against connected server" comment.
- [x] Update `linear.config.md` + `linear.config.json.example` to the new default
      set; update `config.test.js`, `mcp.test.js` to real shapes.
- [x] Failing test passes (GREEN); rebuilt vendored dist; full suite green (242).
- [x] Verified a live push/pull round-trip against the Skitterspec team.
- [x] Added `assets/core/SETUP.md` — the Linear-side setup guide (scaffolded by
      `init`), written from the verified live run.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-07-28 | In Progress | in-progress | Reuben Greaves |
| 2026-07-29 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-07-28 — Bug reproduced live against the `linear` MCP server; five real
  shape mismatches + a markdown-idempotency gap captured as a failing test (red).
- 2026-07-28 — Fixed: normalizeRemote reads real Linear shapes + markdown
  canonicalization; default field set scoped to what round-trips; push no longer
  blocks on pull-owned/unsynced fields; mcp.js matchers/adapter match real
  `save_*` tools. Test green; full suite 242/242.
- 2026-07-28 — Verified live end-to-end on team Skitterspec: pull brought
  status/priority/labels down, push sent an edited description up, and status
  reported "in sync" across Linear's markdown reserialization. Added SETUP.md.
- 2026-07-29 — Completed; all Fix tasks done, tests green (242/242, bug test
  5/5). Deferred (by design): the per-Milestone/Issue spec-body round-trip.
- 2026-07-31 — The deferred body round-trip is now delivered by
  `feat-linear-body-round-trip` (phases ↔ Milestones, tasks ↔ Issues, opt-in via
  `sync.keyedFields`).
