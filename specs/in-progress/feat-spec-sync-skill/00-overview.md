# /spec-sync skill and identifier-drift doctor

> **Type:** Feature
> **Name:** feat-spec-sync-skill (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — Phase 1 (started 2026-09-02)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-02
> **Area:** packages/linear/assets/skills/spec-sync, packages/linear/src/cli-sync.js, packages/linear/src/api.js, packages/linear/test
> **Stack:** worktree

## Problem

`spec-sync` is the only major CLI surface with no skill in front of it. Asked in
plain words to "run spec-sync", there is nothing to run: it is not a command on
its own (it needs a subcommand and usually a spec), and its binary is never on
PATH — it is a local devDependency, so every call is
`pnpm exec skitterspec-linear spec-sync …`, and in a project installing the
Linear superset the binary is not even called `skitterspec`. A user trying
`spec-sync` directly gets `command not found`, which reads as a broken install
rather than a wrong invocation.

`/spec-push` and `/spec-status` cover only the **per-spec** path. Everything
repo-wide — `linked`, `states`, `projects`, `verify`, `stamp`,
`apply --all` — has no skill at all.

Separately, when a workspace's team key is renamed (`REU` → `ERQ` in `~/code/ereqs`),
**nothing detects it and nothing repairs it**. Every stamped `linear_identifier` /
`linear_issue_id` / `linear_url`, the config's `teamKey`, and all 33
`linear-base/<ID>.base.json` filenames stayed on the old prefix. It was fixed by
hand — 221 refs across 54 files.

Raised in `handoff-skitterspec-spec-sync-skill.md`.

## Decisions

1. **One spec, three phases** — the skill, then doctor detect, then doctor
   repair. Each is independently shippable and the skill surfaces doctor once it
   exists. Rejected two separate specs: the skill spec would have to guess at
   doctor's surface, or be revised once doctor lands.
2. **`/spec-sync` with no argument gives the repo-wide overview** (`linked`), not
   a usage error. That is the natural reading of a bare "run spec-sync", and it
   is read-only so the default can never surprise.
3. **Do NOT re-wrap single-spec `push`/`apply`** — that is `/spec-push`. Two front
   doors to one write path is worse than none; the skill defers explicitly.
   Likewise `/spec-status` for per-spec drift.
4. **The skill always states the full invocation it ran.** The `command not found`
   confusion is the motivating friction, so the skill never leaves the user
   guessing at `pnpm exec` or the binary name.
5. **Drift is checked per-ref via the existing `adapter.readIssue`**, not a bulk
   team query. For each stamped `REU-N`, read `ERQ-N` and confirm it exists.
   There is no list, so there is no pagination and no `includeArchived` flag —
   which is precisely the trap that made the hand-run report 146 of 198 refs as
   missing when all were healthy (they were archived). Rejected a paginated
   `team.issues(includeArchived: true)` adapter method: fewer requests, but it
   reintroduces the exact failure mode, and `readIssue` already carries the 429
   retry/backoff that a 198-request sweep needs.
6. **The current team key is read from Linear by `teamId`, never from `config.linear.teamKey`**
   — the config key is one of the things that drifts (it was stale in ereqs).
   `teamId` is stable across a rename. Needs a small `readTeam(teamId) → { key,
   name }` adapter addition.
7. **Repair is dry-run by default, `--write` to apply, and `--write` refuses on a dirty git tree.**
   Matches `spec-sanitise`'s existing dry-run/`--write` convention; the
   clean-tree guard is what makes a 221-edit rewrite reviewable as one diff and
   undoable with `git checkout -- .`. Rejected auto-committing the repair: no
   other `spec-sync` subcommand commits on the user's behalf.
8. **`verify --stored` refuses a `.base.json` snapshot outright**, in the engine
   rather than only in skill prose. Passing a snapshot is a live footgun — it
   stores content *hashes*, so the comparison produced a confident, entirely
   bogus "5045 characters lost". A guard is enforceable; documentation is not.
9. **`apply --all` confirmation splits creates from updates.** An update refreshes
   an existing mirror; a create mints new objects in someone's tracker. In ereqs
   every backlog spec reports "N to create", so a careless `--all` mints dozens
   of sub-issues.

## Solution overview

A new `/spec-sync` skill in the Linear provider's assets, plus a new
`spec-sync doctor` subcommand in the engine.

The skill routes a plain-language ask to the right subcommand, asks when the
intent is genuinely ambiguous between a read and a write, and confirms every
Linear write with create/update counts stated separately. It covers only what no
existing skill does:

| Ask | Subcommand |
|-----|-----------|
| bare `/spec-sync`, "what's linked?" | `linked` |
| "which states / projects?" | `states`, `projects` |
| "did the mirror survive?" | `verify` |
| "link this to KEY-N by hand" | `stamp` |
| "mirror the whole backlog" | `apply --all <bucket>` (confirm first) |
| "is the team key stale?" | `doctor` (phase 2) |
| per-spec push / drift | **defer** to `/spec-push` · `/spec-status` |

`spec-sync doctor` reports, in two separate categories:

```
spec-sync doctor: team ERQ (was REU)
  drift:   198 stamped ref(s) still on REU across 54 file(s)
           33 snapshot file(s) under specs/.core/linear-base/
           config linear.teamKey = "REU"
  missing: 0 ref(s) that resolve to no issue under ERQ
  run with --write to repair (requires a clean git tree)
```

`--write` rewrites the config key, the frontmatter stamps, and the snapshot
filenames together — `git mv` for the snapshots so history survives, and the
identifier-keyed entries *inside* each snapshot renamed to match. The hashes
themselves are content-derived and stay valid, so `status` must still read
`up to date` afterwards.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill | add | `/spec-sync` (Linear distribution only) |
| CLI command | add | `spec-sync doctor [--write] [--json]` |
| CLI command | update | `spec-sync verify` — refuses a `.base.json` as `--stored` |
| Domain object | add | `adapter.readTeam(teamId) → { key, name }` (api + mcp) |
| Config key | update | `linear.teamKey` rewritten by `doctor --write` |

No change to the projection, the snapshot format, or any push/apply write path.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The `/spec-sync` skill, and the `verify` footgun guard | ✅ | [01-skill.md](01-skill.md) |
| 2 | `spec-sync doctor` — detect, read-only | ⬜ | [02-doctor-detect.md](02-doctor-detect.md) |
| 3 | `doctor --write` — repair behind a clean-tree guard | ⬜ | [03-doctor-repair.md](03-doctor-repair.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-02 | Ready | backlog | Reuben Greaves |
| 2026-09-02 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-02 — Spec created from `handoff-skitterspec-spec-sync-skill.md`.
- 2026-09-02 — Phase 1 done. The `verify` guard refuses a snapshot by both
  filename (`*.base.json`) and location (under `sync.baseDir`), so a stray
  `stored.json` written into `linear-base/` is caught too.
