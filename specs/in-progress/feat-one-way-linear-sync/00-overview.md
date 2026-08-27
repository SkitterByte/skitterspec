# One-way Linear sync — repo is the source of truth, Linear is a generated mirror

> **Type:** Feature
> **Status:** In Progress — Phase 1 (started 2026-08-27)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-27
> **Area:** packages/sync-core/src/{normalize,compare,base,push,pull,write,sanitise}.js,
> packages/linear/src/{cli-sync,config}.js, packages/linear/assets/skills/{spec-push,spec-pull,spec-status},
> packages/common/assets (spec-go seam)
> **Stack:** worktree

## Problem

The Linear sync is bidirectional: it reads Linear's re-serialized markdown back,
three-way merges it against a committed base, and can write it into spec files.
Every hard problem we've hit — emphasis mangled across line breaks, a data-loss
hyphen bug in the file-rewriting sanitiser, wrapping wars, spurious `remote-only`
diffs — lives at that read-back seam, because Markdown has no canonical form and
Linear imposes its own. A production consumer (285 specs, ~1,125 files) confirmed
the round-trip is the cost centre, and that nobody actually needs to edit spec
*content* in Linear.

If the repo is the single source of truth and Linear is a **generated, read-only
mirror**, the entire read-back seam disappears — we can delete three-way merge,
the base sidecar, content pull, remote canonicalization, and the sanitiser's
reason to exist, and replace them with a one-sided push. Less code than today,
and the square-peg round-trip is gone rather than armoured against.

## Decisions

1. **Repo is the source of truth; Linear is a generated read-only mirror.**
   Sync is **one-way push only**. Breaking change → `@skitterbyte/skitterspec-linear@8.0.0`.
   Rejected: full bidirectional with AST comparison (keeps the normalization tax
   for an editing workflow nobody uses).
2. **Status is repo-owned; no auto-pull, no daemon.** The lifecycle skills set
   status (folders/frontmatter) and push reflects it to Linear. The "a Linear
   change updates me" need is served by **`/spec-status` as an on-demand,
   read-only drift report** — it surfaces *"Linear workflow-state = X, spec says
   Y"* and *"spec changed since last push"*, but never writes files. Applying a
   change is a deliberate lifecycle action. Rejected: scalar state echo that
   auto-writes (needs a cron/CI job with headless MCP + commit churn, and re-opens
   a write-back path).
3. **Task → issue: first-sentence title + full-text description.** Title = the
   task's first sentence (fallback: first ~100 chars at a word boundary);
   `description` = the full task text; `done` ← checkbox. Fixes the unusable
   paragraph-length titles (consumer median 166 chars, max 2267). Rejected: full
   text as title (status quo, unusable in list view).
4. **No bulk file rewrite.** Inline `(SKI-123)` ids stay in task lines (no
   structural migration). `spec-sanitise` is **demoted to an optional cosmetic
   tidy** with the hyphen-join fix folded in — it is no longer required for
   correct sync. Push-prep (emphasis-join, hyphen-aware) renders clean Linear
   content from wrapped source *without touching files*. Rejected: reformat every
   spec to `prose-wrap: never` (large diff, and unnecessary once read-back is gone).
5. **One-sided push engine with a machine-readable plan.** Compute the local
   projection, diff it against a committed **last-pushed snapshot** (per-object
   content hash + id), emit a **JSON plan** (`project` description; `milestones`
   and `issues` creates/updates with full payloads) the skill applies via MCP and
   stamps ids back; then advance the snapshot. No remote content read, no
   three-way merge. Rejected: read remote to diff (re-introduces canonicalization
   and the round-trip).
6. **Correct + validated project states.** Ship the real project-status names
   (`Backlog / Planned / In Progress / Completed / Canceled`) — not the issue
   names shipped today (`Backlog/Done/Cancelled`). Validate configured names
   against the workspace at push/status time (skill-side, via MCP) and **fail
   loudly** — Linear silently no-ops an unknown project state (`save_project`
   returns 200 unchanged), so a typo must not pass. Fixes consumer report #3.
7. **Retire content pull.** Delete the content pull path and the pull-writeback
   (Linear→file) writers; remove `/spec-pull`; repurpose `/spec-status` to the
   drift/state report; change the `/spec-go` provider seam to push/report instead
   of "pull first". Keep push-side writeback (stamp new ids into frontmatter /
   task lines).
8. **Realistic test fixture.** Add a fixture resembling a real spec — wrapped
   bullets, multi-line goals, hyphenated compounds, `` `apps/**` `` globs inside
   code spans, tables, fenced code — and exercise the push projection against it.
   Fixes report #8 (the root cause the wrapped-bullet and title bugs slipped
   through: synthetic single-line fixtures).

## Solution overview

The engine keeps `normalizeLocal` (now producing richer keyed items — issues with
`{id, title, description, done}`, milestones with `{id, name, goal}`) and a
**push-prep** markdown transform for the pushed payload (emphasis-join,
hyphen-aware — the current `canonicalizeMarkdown`/`joinEmphasisAcrossBreaks`,
retained but used *only* outbound). Everything that read Linear back is removed:

- `pull.js` (content) and `write.js` pull-writeback (`updateTaskLine`,
  `addTaskLine`, `createPhaseFileForMilestone`, `writeMilestoneFields`,
  `applyTasksPull`, `applyMilestonesPull`) → **deleted**.
- `compare.js` three-way ownership/conflict → **replaced** by one-sided
  change-detection (local projection vs last-pushed snapshot).
- `base.js` remote-mirror sidecar → **repurposed** to a last-pushed snapshot
  (hashes + ids of what we last pushed).
- `normalizeRemote` (content) → **removed**; a tiny `remoteWorkflowState` read
  remains for the `/spec-status` drift report only.
- `push.js` → **rewritten** one-sided: emits the JSON plan; never gates on a
  remote read; advances the snapshot.

`spec-sync` CLI: `push` emits the JSON plan (+ `--json`); `status` becomes the
read-only drift/state report; `pull` is removed. Provider skills: `/spec-push`
applies the plan and stamps ids; `/spec-status` reports; `/spec-pull` deleted.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Domain object | update | `normalizeLocal` issues → `{id,title,description,done}`; first-sentence title |
| Domain object | update | `push.js` one-sided; emits JSON plan vs last-pushed snapshot |
| Domain object | update | `compare.js` → change-detection (drop ownership/conflict/three-way) |
| Domain object | update | `base.js` → last-pushed snapshot (was remote mirror) |
| Domain object | remove | `pull.js` content path; `write.js` pull-writeback writers; `normalizeRemote` content |
| Domain object | update | `canonicalizeMarkdown`/`joinEmphasisAcrossBreaks` retained as outbound push-prep (hyphen-aware) |
| CLI command | update | `spec-sync push` emits JSON plan (`--json`); `spec-sync status` = drift report |
| CLI command | remove | `spec-sync pull` |
| CLI command | update | `spec-sanitise` demoted to optional cosmetic (hyphen fix folded in) |
| Config key | update | `states` defaults → project statuses; add workspace validation |
| Skill/rule | remove | `/spec-pull` |
| Skill/rule | update | `/spec-status` → drift/state report; `/spec-push` applies plan; `/spec-go` seam pushes not pulls |
| Business rule | add | Repo is source of truth; Linear is generated read-only; one-way push |

## Phases

Each phase lives in its own file. Status: ⬜ not started · 🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Outbound projection: title/description split, push-prep (hyphen), states, realistic fixture | ✅ | [01-outbound-projection.md](01-outbound-projection.md) |
| 2 | One-sided push engine: last-pushed snapshot + machine-readable plan | ⬜ | [02-push-engine.md](02-push-engine.md) |
| 3 | Retire pull, prune dead code, repurpose skills + config + docs | ⬜ | [03-retire-pull.md](03-retire-pull.md) |

## Open questions

- [ ] None blocking. (Sub-decision confirmed: `/spec-status` is the on-demand
      drift report; no scheduled echo in 8.0.0 — revisit only if a team asks for
      automated state reconciliation.)

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-27 | Ready | backlog | Reuben Greaves |
| 2026-08-27 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-08-27 — Spec created. Direction set to one-way (repo owns) after a
  production-consumer review; absorbs the pending hyphen-join hotfix and feedback
  items #3 (states), #4 (push plan), #5 (title/description), #8 (fixtures).
- 2026-08-27 — Re-cut phase boundary: the task-item shape change moved from
  Phase 1 to Phase 2 (it would break the three-way compare mid-phase); Phase 1 is
  additive so all baseline tests stay green.
- 2026-08-27 — Phase 1 done: realistic fixture; hyphen-safe collapse everywhere
  (`collapseHyphenAware`, `joinOpenSpans` guard, push-prep); `titleFromText`;
  `validateStates`; corrected project-state defaults. 461 tests green (452 + 9).
