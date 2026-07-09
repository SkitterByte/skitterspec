# Tracker issue intake — `/spec-from-issue`

> **Type:** Feature
> **Status:** Draft — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-06-29
> **Area:** assets/skills/, src/cli.js, src/init.js, src/ (new config/normalize/status), skitterspec.config.json, README.md, assets/rules/spec-planning.md, assets/claude-md-section.md

## Problem

The spec lifecycle starts at the dev's keyboard (`/spec`, `/spec-bug`). But the
whole project team — non-devs included — needs a way to raise work that becomes a
spec without learning the git/markdown workflow. They already live in a tracker
(Shortcut). Today there's no bridge: a request in the tracker has to be re-typed
into a spec by hand, and once a spec exists the team can't see its progress
without reading the repo. We want issues raised in the tracker to flow **into**
skitterspec as seeded specs, and spec progress to flow **back** as lightweight
status — without coupling skitterspec to any one tracker.

## Decisions

1. **Direction: content inbound, status outbound (thin).** The tracker issue is
   the *request*; the spec is the engineering *truth*. Issue content flows
   one-way into a spec; the spec body **never** syncs back. Only lifecycle status
   (state + a backlink comment) reflects outward. Rejected two-way content sync —
   it reintroduces the source-of-truth conflict the whole spec workflow avoids.
2. **Fetch via MCP + declarative provider profiles.** The skill reads the issue
   through the tracker's connected **MCP server** (Shortcut and Linear both ship
   official ones). A provider is a small declarative **profile** (MCP tool names,
   field map, label→type routing, triage tag, status→state map). Rejected
   shipping code REST adapters — keeps skitterspec zero-dependency and in
   character; adding a tracker is a profile, not code.
3. **`/spec-from-issue` is a thin front-door, not a re-implementation.** It
   fetches + normalizes the issue, then **delegates** to the existing `/spec`
   (feature → grill, seeded) or `/spec-bug` (bug → repro, seeded) based on the
   issue's routing label. One authoring path.
4. **Full lifecycle reflection, best-effort.** `/spec-go`, `/spec-complete`,
   `/spec-cancel` gain a small clause: if the spec carries a `Source:` field,
   reflect the new state + post a comment via the profile. Best-effort — a failed
   write warns but never blocks the spec transition.
5. **Config: root `skitterspec.config.json`.** Holds `tracker` (active),
   `triageTag`, and `profiles` (inline). The scaffolder writes a starter file
   with a Shortcut profile. Swapping to Linear = add a `linear` profile + flip
   `tracker`.
6. **Manual pull for v1.** v1 is `/spec-from-issue <id>`, human-driven. Automated
   intake (a scheduled agent polling the triage tag) is a noted future phase, not
   built now.
7. **Triage gate.** The skill only acts on an issue carrying the configured
   `triageTag` (a human triages first); it warns/confirms if the tag is absent.
8. **De-dup on `Source`.** Re-running on the same issue must not create a second
   spec — refuse (and point to the existing one) if any spec already carries that
   `Source: <id>`.

## Solution overview

**Config — `skitterspec.config.json` (root):**

```json
{
  "tracker": "shortcut",
  "triageTag": "ready-for-spec",
  "profiles": {
    "shortcut": {
      "mcp": "shortcut",
      "tools": { "fetch": "get-story", "comment": "create-story-comment", "setState": "update-story" },
      "map": { "title": "name", "body": "description", "labels": "labels[].name", "reporter": "requested_by", "url": "app_url" },
      "routing": { "bug": "bug", "feature": "feature" },
      "status": { "InSpec": "In Spec", "InProgress": "In Development", "Complete": "Done", "Cancelled": "Won't Do" }
    }
  }
}
```

(MCP tool names + field paths above are **illustrative** — they're verified
against the live Shortcut MCP server during build and encoded only in the
profile. Nothing else in the system hard-codes them.)

**Normalized issue (the seam both inbound + future adapters produce):**

```json
{ "id": "sc-123", "url": "...", "title": "...", "body": "...",
  "type": "feature|bug|null", "labels": ["..."], "reporter": "...",
  "comments": [{ "author": "...", "text": "..." }] }
```

**New CLI surface** (consumed by the markdown skills so mapping is deterministic,
not done in Claude's head):

- `skitterspec issue normalize` — raw provider JSON on **stdin** → normalized JSON
  on stdout (applies the active profile's `map` + `routing`).
- `skitterspec issue map-status <LifecycleStatus>` → the provider state string.
- `skitterspec config check` — validate the config, list errors, exit non-zero on
  failure.

**Inbound flow (`/spec-from-issue sc-123`):** resolve active profile → confirm
`triageTag` → MCP-fetch raw issue → `skitterspec issue normalize` → de-dup on
`Source` → route on `type`: feature → `/spec` (seed grill), bug → `/spec-bug`
(seed repro) → stamp `Source` + `Raised by` in the spec header → post one backlink
comment (+ optional `InSpec` state).

**Outbound reflection:** `/spec-go|complete|cancel` resolve provider state via
`issue map-status`, then set state + comment via the profile's MCP tools, guarded
by a `Source` field and best-effort.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Config + normalize/validate CLI (the seam) | ⬜ | [01-config-and-normalize.md](01-config-and-normalize.md) |
| 2 | `/spec-from-issue` skill + scaffolder wiring | ⬜ | [02-spec-from-issue-skill.md](02-spec-from-issue-skill.md) |
| 3 | Outbound status reflection in lifecycle skills | ⬜ | [03-status-reflection.md](03-status-reflection.md) |

## Open questions

- [ ] Exact Shortcut MCP server + tool names and raw field paths (`get-story`,
      comment, `update-story`, the label/state field names) — verified against the
      connected Shortcut MCP server in Phase 1/2; encoded only in the profile.
- [ ] Should this spec also `/spec-init` skitterspec to fully dogfood the
      workflow? (Currently it creates only the minimal `specs/backlog/` it needs.)

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-06-29 | Draft | backlog | Reuben Greaves |

## Changelog

- 2026-06-29 — Spec created. Decisions set via grill: MCP + provider profiles;
  thin front-door delegating to /spec & /spec-bug; full best-effort lifecycle
  reflection; root `skitterspec.config.json`; manual pull for v1 (auto-intake
  deferred).
