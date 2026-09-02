# `spec-sync doctor` — one readiness check across every layer

> **Type:** Feature
> **Name:** feat-setup-doctor (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — Phase 1 (started 2026-09-02)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-02
> **Area:** packages/linear/src/doctor.js (new), packages/linear/src/cli-sync.js, packages/linear/assets/skills/spec-linear-setup/SKILL.md, packages/linear/assets/core/SETUP.md
> **Stack:** worktree

## Problem

Setting skitterspec up spans four layers — the `specs/` scaffold and skills,
per-spec isolation, the tracker config, and the API key — and each is checked by
a different command, or not at all. `skitterspec init` reports the scaffold and
isolation; `spec-sync credentials status` reports the key; the tracker config has
**no** readiness check, only commands that write it. Nothing reports all four, so
"is this project set up?" has no single answer, and a skill needing to know its
own prerequisites has nothing to call.

The gap is felt most on a repo someone else configured, or on a second machine:
the failure surfaces later as a confusing `spec-sync` error rather than up front
as "the key is missing, run this".

## Decisions

1. **It lives in the provider distribution, not the base.** The base is
   deliberately tracker-free and structurally cannot inspect a tracker config —
   the same constraint that made `init` misreport tracker sync until
   `f75e612`. The superset is the only place that can see every layer.
2. **Read-only by default.** A doctor you cannot run "just to look" is one people
   stop running. It never writes config, never creates the credentials store, and
   never prompts. Rejected an `init`-style "offer to fix it" mode: the fixes
   already exist as their own commands, and the value here is an honest report.
3. **Every failing row names the exact command that fixes it**, so the output is
   actionable without reading docs — the shape `credentials status` already uses.
4. **Never prints a secret.** Reuses the credentials `fingerprint` — masked, with
   its source. This is the command a skill runs, so it must be safe by
   construction, not by convention.
5. **Offline by default; `--check-remote` for the live half.** Well-formed config
   is not working config: the team id may not resolve and the key may be revoked.
   But a doctor that always hits the network is slow and fails on a plane, so the
   live check — one `team(id:)` call proving the id resolves and the key is
   accepted — is opt-in.
6. **Exit non-zero when anything is missing**, and `--json` for a machine-readable
   payload, so `/spec-linear-setup` and other skills can branch on readiness
   rather than parse prose.
7. **Rows are checks, not a fixed list.** Each is `{ id, label, state, detail,
   fix }` with state `ok` · `missing` · `broken`, so a later layer is a new row
   rather than a rewrite. `missing` means opt-in-and-not-taken (fine), `broken`
   means configured-but-wrong (not fine) — the distinction the current commands
   blur.

## Solution overview

```
$ skitterspec spec-sync doctor
  scaffold     ok       specs/ + 12 skills installed
  isolation    ok       env.config.json — worktree per spec
  tracker      ok       linear.config.json — team e07c2b54 (SKS)
  key          missing  no key for SKS
                        → skitterspec spec-sync credentials set
  remote       skipped  pass --check-remote to verify against Linear

  1 check needs attention.
```

`--check-remote` adds one `team(id:)` call: `remote ok — team SKS resolves, key
accepted`, or `broken` with what came back.

`--json` emits `{ ok, checks: [{ id, label, state, detail, fix }] }`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-sync doctor [--check-remote] [--json]` |
| Module | add | `linear/src/doctor.js` — pure checks over injected state |
| API adapter | update | reuse `readTeam` for the remote check |
| Skill/rule | update | `/spec-linear-setup` ends by running doctor |
| Docs | update | `SETUP.md` names doctor as the "is it working?" step |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The offline checks, as a pure report | ⬜ | [01-offline-checks.md](01-offline-checks.md) |
| 2 | The command, and the skill that runs it | ⬜ | [02-command-and-skill.md](02-command-and-skill.md) |
| 3 | Verify it actually works against Linear | ⬜ | [03-check-remote.md](03-check-remote.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-02 | Ready | backlog | Reuben Greaves |
| 2026-09-02 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-02 — Spec created, after `init` was found reporting tracker sync as
  unconfigured on a configured repo (fixed in `f75e612`). That bug was one layer
  of the same gap: no single place answers "is this set up?".
