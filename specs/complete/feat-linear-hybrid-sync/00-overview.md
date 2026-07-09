# Linear hybrid sync — git-like `/spec-push` · `/spec-pull` · `/spec-status`

> **Type:** Feature
> **Status:** Complete (2026-07-09)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-07-08
> **Area:** src/sync/ (new), src/cli.js, src/init.js, assets/skills/ (spec, spec-go, + new spec-push/spec-pull/spec-status), specs/.core/linear.config.json (new), assets/rules/, README.md
> **Stack:** worktree

## Problem

The spec lifecycle starts and stays at the dev's keyboard. The rest of the team
lives in Linear, where status, priority, discussion, and hierarchy belong. Today
there is no bridge: a Linear story must be hand-retyped into a spec, and spec
progress is invisible from Linear. We want Linear to own **status and
discussion** while the repo remains the **co-authoring surface for spec
content** — Claude Code, with the codebase in view, refines a thin PM-written
story into a real spec. Because both sides author, the sync must be
**bidirectional but git-like and safe** (explicit commands, no blind
overwrites), not the one-way intake the superseded `feat-spec-from-issue` spec
proposed.

## Decisions

1. **Bidirectional, three-way merge — not one-way intake.** Store the
   last-synced state as a committed **base sidecar** so pull/push compare *local
   vs remote vs base* and distinguish local-only, remote-only, and true
   conflicts. Rejected the two-way blind overwrite (clobbers a co-author) and
   the one-way content intake of `feat-spec-from-issue` (can't refine upward).
   That spec is **superseded/cancelled** by this one.
2. **Field ownership collapses conflicts.** The spec is structured fields, most
   written by one side only. `fieldOwnership` marks each field `both` (push+pull),
   `pull` (Linear→local), or `push` (local→Linear); `localOnlySections` never
   push. Only genuinely co-authored fields can conflict.
3. **Deterministic engine in code, thin skills.** The three-way compare, hashing,
   ownership enforcement, base/backup handling live in `src/sync/` behind a
   `skitterspec spec-sync <normalize|status|push|pull>` CLI seam (mirrors the
   repo's existing "push mapping into the CLI, not Claude's head" pattern). The
   skills are thin wrappers. Rejected doing the merge in-context (non-deterministic).
4. **Linear is opt-in.** Every Linear step activates only when
   `specs/.core/linear.config.json` exists. No config → `/spec` and `/spec-go`
   behave exactly as today (local-only). Keeps the OSS tool usable without Linear
   and the new skills degrade cleanly.
5. **Optimistic concurrency + recoverable `--force`.** Push re-reads the remote
   `updatedAt`/hash immediately before writing; if it moved past base, abort and
   say "pull first" (unless `--force`). `--force` backs up the about-to-be-
   clobbered side into `{backupDir}` first (the reflog) — force never destroys
   without a copy. After any successful pull/push/force, **rewrite the base**.
6. **Runtime MCP discovery.** Discover Linear MCP tool names at runtime (don't
   hardcode). If Linear isn't connected/authed, stop with a clear fix message and
   do nothing destructive.
7. **Mapping (config-driven).** spec folder → Linear **Project**; `00-overview.md`
   → project description; phases (`01-`, `02-`…) → **Milestones** (configurable to
   Issues); tasks → **Issues**; optional **Initiative** groups specs. All values
   (`mapping`, `states`, paths, `branch.pattern`, ownership) come from config.

## Solution overview

**Config — `specs/.core/linear.config.json`** (+ committed `.example.json`),
placed where skitterspec's `.core` convention dictates. Full schema in Phase 1;
`fieldOwnership` values `both|pull|push`, `localOnlySections` are marked markdown
sections never pushed.

**Snapshot frontmatter** (in each spec's `00-overview.md`):

```yaml
---
linear_project_id: "<uuid>"
linear_identifier: "ENG-123"
linear_url: "https://linear.app/..."
spec_status: "backlog"
last_synced_at: "<ISO-8601>"
---
```

**Base sidecar:** `{sync.baseDir}/{identifier}.base.json` — committed, so each
worktree carries its own base and the divergence check stays accurate.

**Sync engine (`src/sync/`, used by push/pull/status):**

1. **Normalize** a Linear Project + milestones/fields and the local snapshot into
   the same field set → comparable.
2. **Three-way compare** each field vs the base → classify `unchanged` /
   `local-only` / `remote-only` / `conflict` (both moved off base).
3. **Enforce ownership:** never write `pull` fields up, never write `push` fields
   down, skip `localOnlySections` on push.
4. **Optimistic concurrency** on push; **backup-before-force**; **rewrite base**
   on any success.

**Commands:**

- `/spec-status` — read-only `git status` analog; prints per-field divergence for
  the current spec. Cheap; changes nothing.
- `/spec-pull [--force]` — Linear→local. Applies remote-only; refuses to clobber
  local edits not in base (reports conflict). `--force` = remote wins, after
  backing up local.
- `/spec-push [--force]` — local→Linear. Ownership-respecting, concurrency-checked.
  Refuses if Linear moved since base. `--force` = local wins, after backing up
  remote. Never writes `pull` fields or `localOnlySections`.
- `/spec` (extended, opt-in) — create Linear Project + a Milestone per phase,
  scaffold the local snapshot + frontmatter + **initial base** (clean, non-
  diverged), echo the branch name from `branch.pattern`.
- `/spec-go` (surgical) — run `/spec-pull` then commit the refreshed snapshot into
  the feature branch so the frozen spec rides in the PR.
- `/spec-sync` — retired (never shipped here); push/pull/status replace it.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Config + engine core (the seam) | ✅ | [01-config-and-engine.md](01-config-and-engine.md) |
| 2 | MCP adapter + push/pull execution | ✅ | [02-mcp-push-pull.md](02-mcp-push-pull.md) |
| 3 | Sync skills (status/pull/push) | ✅ | [03-sync-skills.md](03-sync-skills.md) |
| 4 | Extend /spec + /spec-go (opt-in) | ✅ | [04-touch-existing-skills.md](04-touch-existing-skills.md) |
| 5 | Docs + supersede | ✅ | [05-docs-and-supersede.md](05-docs-and-supersede.md) |

## Open questions

- [ ] Linear MCP tool names/shape for Projects + Milestones (create/read/update)
      — verified against the connected Linear MCP server in Phase 2; encoded only
      in the adapter.
- [ ] Milestone vs Issue for phases — default `milestone`; confirm Linear's MCP
      exposes project milestones for write before committing the default.
- [ ] **Body-field write-back (denormalizer).** Pull currently applies only the
      frontmatter-mapped `pull`-owned fields; writing a pulled `both`-owned body
      field (`description`, `milestones`, `phaseBodies`, `taskBreakdown`) back into
      the overview/phase markdown is deferred (reported as `deferred`, base kept
      pending). Design the round-trip (which also resolves the `phaseBodies`/
      `milestones` name-vs-slug asymmetry between local phase files and Linear
      milestones) before relying on remote→local body sync.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-07-08 | Draft | backlog | Reuben Greaves |
| 2026-07-09 | In Progress | in-progress | Reuben Greaves |
| 2026-07-09 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-07-09 — Completed; all 5 phases done, tests green (187 pass, 0 fail).
  **Consciously deferred** (tracked in Open questions, not blockers): (1) verify the
  Linear MCP tool names/shape against a live server — the adapter uses runtime
  discovery and is unit-tested with a fake, but no live Linear round-trip has run
  yet; (2) confirm Linear's MCP exposes project **milestones** for write before
  relying on the `milestone` default for phases; (3) the remote→local **body-field
  write-back denormalizer** (pull still reports body fields as `deferred`). These
  need a connected Linear workspace and are best handled as a follow-up spec.
- 2026-07-09 — Phase 5 complete (all phases done). Documented adoption and retired
  the superseded design. README gained a "Linear hybrid sync" section (mapping,
  opt-in gate, the `/spec-status → /spec-pull → refine → /spec-push` lifecycle,
  field ownership, `--force`/backup); `spec-planning.md` gained a house-style
  pointer to the sync skills. Resolved the `.gitignore` question: **commit** the
  base sidecars (`sync.baseDir`), **ignore** the `--force` backups
  (`sync.backupDir`) — added the ignore line + a "What to commit" doc section.
  Confirmed `feat-spec-from-issue` is cancelled/superseded (both directions
  cross-linked). Two drift-guard tests added (187 green).
- 2026-07-09 — Phase 4 complete. Extended the two existing skills behind the
  opt-in gate. `/spec` gained "Phase E — link to Linear" (create Project +
  Milestone per phase, add the frontmatter block, capture the initial base via
  `spec-sync normalize`, echo the branch name; commits stay the user's, git never
  auto-pushed). `/spec-go` gained "3b. Sync from Linear first" (run `/spec-pull`,
  commit the refreshed snapshot into the branch, expect Linear's GitHub
  automation to move status). Both stay inert without `linear.config.json`.
  Confirmed no `/spec-sync` skill ships — push/pull/status replace it. Two
  doc-assertion tests added (185 green).
- 2026-07-09 — Phase 3 complete. Added the three thin skills — `/spec-status`
  (read-only), `/spec-pull`, `/spec-push` — each fetching the linked Linear project
  over MCP into a temp file, running `spec-sync <cmd> --remote`, and (push) applying
  the engine-blessed writes back over MCP. Registered in `init`'s `SKILLS` + Done
  message, dogfood symlinks committed, tests assert frontmatter + install (183
  green). Also gave `spec-sync status` a `--remote` flag for true three-way status.
  Follow-up noted: a plan/apply split so the base advances only after the live
  Linear write confirms.
- 2026-07-09 — Phase 2 complete. Shipped the MCP boundary (`src/sync/mcp.js` —
  runtime `discoverLinear` + `makeAdapter`) and the `pull`/`push` engines with
  three-way conflict refusal, ownership enforcement (`pull` fields never pushed),
  optimistic concurrency (base `__meta.updatedAt` + re-read-before-write), and
  backup-before-force; wired `spec-sync push|pull` over a `--remote` file adapter.
  Decisions: (a) `workflowState` now normalizes both sides to the lifecycle bucket
  via `config.states` so it stops perpetually diverging; (b) **remote→local
  body-field write-back is deferred** — pull applies the frontmatter `pull`-owned
  fields and reports body fields as `deferred` with base kept pending, so nothing
  is falsely marked synced (tracked in Open questions). 180 tests green.
- 2026-07-09 — Phase 1 complete. Shipped `src/sync/` engine (`config`,
  `normalize`, `compare`, `base`) + `spec-sync normalize|status` CLI seam, all
  MCP-free and green (160 tests). Two decisions worth recording: (a) the config
  template lives in `assets/core/` (not committed to `specs/.core/` — that's the
  consumer's live, opt-in copy), matching the `env.config` convention and wired
  into `init`'s `CORE_FILES`; (b) `classify` exposes `raw` + ownership-collapsed
  `status`/`pushable`/`pullable` so a `pull`/`push` field can never sync the wrong
  way and only `both` fields ever surface a true conflict.
- 2026-07-08 — Spec created. Supersedes cancelled `feat-spec-from-issue`.
  Decisions set via grill: bidirectional three-way merge with committed base
  sidecars; field ownership; deterministic `src/sync/` engine behind a
  `spec-sync` CLI seam with thin skills; Linear opt-in (gated on
  `specs/.core/linear.config.json`); optimistic concurrency + backup-before-force;
  runtime MCP discovery.
