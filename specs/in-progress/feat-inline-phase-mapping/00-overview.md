# Per-bucket phase mapping, with an `inline` mode

> **Type:** Feature
> **Name:** feat-inline-phase-mapping (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — Phase 3 (started 2026-08-30)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-29
> **Area:** packages/linear (config), packages/sync-core (normalize), spec-push/spec-status skills
> **Stack:** worktree

## Problem

`mapping.phases` is one setting for a whole repo, and its only values are
`subissue` and `deferred`. A repo therefore cannot want different things for
active and finished work — but it does.

Reported from `ereqs`: 250 **completed** specs, for which minting 669+ sub-issues
is tracker noise nobody will read; the wanted shape is one issue per spec with
the phases as sections in the description. They also have 29 backlog and 2
in-progress specs that legitimately want assignable sub-issues. There is no way
to express both, so they bypassed the engine with a local composer.

`deferred` does not help: it withholds phases only for `backlog` and `cancelled`
(`normalize.js` → `UNSTARTED_BUCKETS`), and these specs are `complete`. It also
*suppresses* phases rather than inlining them, so the phase content would still
be missing.

## Decisions

1. **`mapping.phases` accepts a per-bucket map as well as a scalar.** A scalar
   keeps meaning what it means today; a map keys the mode by lifecycle bucket:
   `{"backlog": "subissue", "in-progress": "subissue", "complete": "inline"}`.
   Rejected: a scalar-only `inline`, which cannot express the reporter's repo;
   and a per-spec frontmatter override, which means stamping 250 files.
2. **The scoping matters because phases-as-sub-issues was a deliberate choice.**
   Collapsing phases into description sections was rejected before, because
   parallel agents need individually assignable phases. That reasoning holds for
   work in flight and does not hold for finished work, so the mode belongs on the
   bucket rather than on the repo.
3. **`inline` renders each phase as a section of the spec issue's description**,
   and the `## Phases` index is kept rather than stripped — under `subissue` the
   index is dropped because the sub-issues carry it, and with no sub-issues it is
   the only table of contents there is.
4. **A phase already carrying an id keeps its sub-issue, whatever the mode.**
   Exactly the rule `deferred` already uses, and for the same reason: one-way
   sync has no delete op, so withholding a live sub-issue would freeze it in the
   tracker rather than remove it. Switching a repo to `inline` is therefore
   non-destructive, and a spec part-way through keeps a coherent mirror.
5. **`subIssues` stays in `fieldOwnership`.** The `phasesProjected` bind
   (`normalize.js:617`) derives "strip the Phases index" from the field being
   owned, which conflates *what we sync* with *how phases are shaped*. `inline`
   resolves per spec, so the index decision moves to the resolved mode and
   `fieldOwnership` goes back to meaning only what it says.
6. **`deferred` is untouched.** It stays a valid value in both scalar and map
   form; nothing about existing configs changes.

## Solution overview

One resolver — `phaseModeFor(bucket, config)` → `subissue` | `deferred` |
`inline` — reads the scalar or the map and is the single place the three modes
are decided. `phaseProjection` and the description's index-stripping both consult
it, so they cannot disagree.

```json
"mapping": {
  "phases": { "backlog": "subissue", "in-progress": "subissue", "complete": "inline" }
}
```

Under `inline`, the projection sends no new sub-issues and appends each unlinked
phase to the description:

```markdown
## Phases

| # | Phase | Status | File |
…

### Phase 1 — Flatten nested tables ✅

<the phase body, exactly as `subIssueBody` projects it for a sub-issue>
```

The phase body is the same projection either way, so `inline` inherits the
fidelity fix from `bug-phase-content-dropped` rather than growing a second
composer — which is what the reporter had to hand-roll.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | update | `mapping.phases` accepts a per-bucket map; new value `inline` |
| Projection | update | `inline` appends phase sections; keeps `## Phases` index |
| Projection | update | index-stripping keys on the resolved mode, not `fieldOwnership` |
| CLI command | update | `spec-sync push`/`status` report the mode in use |

Backward compatible: every existing config is a scalar and resolves to today's
behaviour for every bucket.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Per-bucket resolution for the existing modes | ✅ | [01-mode-resolver.md](01-mode-resolver.md) |
| 2 | The `inline` projection | ✅ | [02-inline-projection.md](02-inline-projection.md) |
| 3 | Surface it: CLI, skills, docs | ⬜ | [03-surface-and-docs.md](03-surface-and-docs.md) |

## Open questions

- [ ] None.

## Depends on

- `bug-phase-content-dropped` — `inline` reuses `subIssueBody`'s projection, so
  it should land on the fixed version rather than inherit the content loss into a
  second surface.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-29 | Ready | backlog | Reuben Greaves |
| 2026-08-30 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-08-29 — Spec created from an `ereqs` handoff. Confirmed against 10.1.0:
  `PHASE_MAPPINGS` is `['subissue', 'deferred']` and `deferred` withholds only
  for `backlog`/`cancelled`, so it does not cover completed specs.
- 2026-08-29 — Chose a per-bucket map over a scalar `inline` specifically to
  preserve the earlier decision that phases stay assignable sub-issues for work
  in flight; that reasoning applies to active buckets, not finished ones.
- 2026-08-29 — Adopted `deferred`'s "already-linked phases keep their sub-issue"
  rule for `inline` too, so switching modes is non-destructive under one-way sync.
- 2026-08-30 — Phase 1: `phaseModeFor` returns the mode the config *names*, and
  `deferred`'s "only while unstarted" gate stays in `phaseProjection`. Folding
  the gate into the resolver would have made a scalar `deferred` resolve to
  `subissue` for a complete spec — breaking the compatibility guarantee the
  phase's own tests assert, and misreporting the config in Phase 3's CLI line.
- 2026-08-30 — Phase 1: the valid bucket keys are `Object.keys(states)` rather
  than a second literal list; `mapping.phases` and `states` key on the same
  folder bucket, so deriving one from the other stops them drifting.
- 2026-08-30 — Phase 2: inlined phase bodies are demoted two heading levels so
  they nest under the `###` that introduces them. Emitting the sub-issue body
  verbatim, as the solution sketch showed, would put `## Tasks` at the same level
  as `## Problem` and pull every later phase under it. Only `#` run lengths
  change, so the one-composer guarantee holds and is asserted directly.
- 2026-08-30 — Phase 2: `phaseProjection` returns `inlined` separately from
  `withheld`. The two modes filter sub-issues identically, but an inlined phase
  is present in the mirror, so folding it into `withheld` would make the CLI's
  "N phases deferred" line report the opposite of what happened.
