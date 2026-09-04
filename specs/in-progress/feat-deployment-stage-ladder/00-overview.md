---
linear_identifier: "SKS-41"
linear_url: "https://linear.app/skitterbyte/issue/SKS-41/project-configured-deployment-stage-ladder"
---

# Project-configured deployment stage ladder

> **Type:** Feature
> **Name:** feat-deployment-stage-ladder (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — Phase 3 next (Phase 2 done 2026-09-04)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-04
> **Area:** packages/linear/src/config.js, packages/linear/src/cli-sync.js, packages/linear/src/doctor.js, packages/sync-core/src/compare.js, packages/sync-core/src/push.js, packages/sync-core/src/normalize.js, packages/skitterspec-linear/assets/core, docs
> **Stack:** worktree

## Problem

A spec's lifecycle stops at `complete`. What happens next — deployed to test,
approved for demo, live in prod — is a fact about an **environment**, and no
folder under `specs/` can ever derive it. So a release is cut, CI knows exactly
which tickets it contains (`spec-sync released`, shipped 2026-09-02), and
nothing can move them.

Two things block simply calling Linear from a pipeline. First, the ladder is
**per project** — `On Test` / `Ready for Demo` is one team's convention, and
baking it into the tool repeats the mistake skittership was split out to avoid.
Second, the repo already owns `workflowState`, so a second writer fights it: a
CI move to `On Test` is reverted by the next push, and reported as drift by
`/spec-status` forever.

## Decisions

1. **The ladder is project-declared config** (`release.stages`), not a shipped
   convention. Absent = the feature does not exist and every path behaves
   exactly as today — the same opt-in discipline as `linear.config.json` itself.
2. **CI names the stage KEY, never the Linear state name.** `spec-sync stage test`,
   not `--state "On Test"`. Renaming a Linear column is then one config edit
   instead of a hunt through pipeline YAML — and stage names join `validateStates`,
   so the rename fails loudly. Today an unknown state name is **silently ignored
   by Linear**: the push succeeds and the issue never moves.
3. **A separate `stage` verb, dry-run by default.** Rejected `released --move`:
   `released` is currently a command that provably cannot write, and it should
   stay one. `--apply` is required to write.
4. **State stops being welded to description in the plan.** `specIssueHash`
   hashes `{description, state}` together (`compare.js:47`), so *any* prose edit
   re-emits `plan.issue` carrying `state` and re-asserts it. Splitting them so
   each diffs independently is what stops push fighting CI — **no `cedeAfter`
   knob is needed**, and it is a correctness fix on its own terms. Rejected
   nulling `status` in the projection: that changes every existing spec's hash
   and churns the whole mirror on the next push.
5. **The snapshot gains a second hash, with a fallback.** An old snapshot has no
   split hash; that reads as *unknown*, which falls back to today's welded
   behaviour for exactly one push and rewrites itself in the new shape. No
   migration, no mass re-push, and the unknown case takes the branch that cannot
   be wrong (negative-checks rule 4).
6. **A declared stage state is not drift.** `bucketForState` lowercases an
   unrecognised name, so `On Test` becomes `"on test"`, never equals `complete`,
   and `cli-sync.js:479` reports drift on every deployed spec forever. Stage
   states are taught to read as their origin bucket and reported as position, not
   disagreement.
7. **Only refs whose spec is in `complete` are moved** — skipped ones are named
   with the reason. An in-progress spec landed via `/spec-to-main` is genuinely
   deployed, but push still owns its state and would bounce it back; one writer
   per issue at all times beats a visible flip-flop.
8. **Only refs matching `linear.teamKey` are moved.** A range can carry another
   team's `ABC-12`; writing to a team this repo was never configured for is the
   worst failure available here.
9. **Order is recorded, not enforced.** A rollback from test and a hotfix going
   straight to prod are both legitimate, so a backwards or skipping move warns
   and proceeds — refusing would be an accusing check that is wrong on healthy
   input.
10. **Nothing is written back into the spec.** Deployment is not repo-derived;
    recording it in frontmatter would make the repo claim something it cannot
    know and break one-way sync. The ladder lives in Linear only.
11. **Doctor warns on a non-completed last rung**, and only on the API transport
    — `--workspace-states` carries names without types, so the MCP path skips the
    check rather than guessing.

## Solution overview

The project declares its own ladder:

```jsonc
"release": {
  "stages": [
    { "key": "test", "state": "On Test" },
    { "key": "demo", "state": "Ready for Demo" },
    { "key": "prod", "state": "Done" }
  ]
}
```

A pipeline stage then moves whatever that release contains:

```
$ spec-sync stage test v10.6.0..HEAD          # dry run — the default
spec-sync stage: test -> "On Test"  (v10.6.0..HEAD)

  would move 2 ticket(s)
    SKS-38  Ticket refs in commits, and a release's ticket list
    SKS-41  Project-configured deployment stage ladder

  skipped 1 — not team SKS: ABC-9
  skipped 1 — spec not complete: SKS-44 (push owns its state)
  3 commit(s) carry no ref

$ spec-sync stage test v10.6.0..HEAD --apply
```

The existing six-status table decomposes into four values already in
`states` (with `complete` → `"In Review"` a one-line config edit) plus this
one project-defined list. Nothing about `On Test` or Azure reaches shipped code.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `release.stages[]` — `{key, state}`, ordered |
| CLI command | add | `spec-sync stage <key> [<range>] [--apply] [--json]` |
| Module | update | `compare.js` — split issue hash; `push.js` — per-field plan |
| Module | update | `normalize.js` — `bucketForState` knows stage states |
| CLI command | update | `spec-sync status` — stage position, not drift |
| CLI command | update | `spec-sync doctor` — ladder shape check (API path only) |
| Snapshot format | update | second hash on `issue`, back-compatible |
| Docs | add | CI wiring page + `linear.config.md` section |

No change to the projection field set, the description projection, or any
sub-issue path. Sub-issue states stay driven by phase emoji — CI never touches them.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `release.stages` config + name validation | ✅ | [01-stages-config.md](01-stages-config.md) |
| 2 | State diffs independently of description | ✅ | [02-state-field-split.md](02-state-field-split.md) |
| 3 | `spec-sync stage` — the write verb | ⬜ | [03-stage-verb.md](03-stage-verb.md) |
| 4 | Doctor ladder check + CI wiring docs | ⬜ | [04-doctor-and-docs.md](04-doctor-and-docs.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-04 | Ready | backlog | Reuben Greaves |
| 2026-09-04 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-04 — Spec created.
- 2026-09-04 — Phase 2 done. The snapshot now carries both the split
  `issueFields` hashes and the original combined `issue` hash, so an older CLI
  reading a newer snapshot still works — cheaper than a migration. `applyOneSpec`
  needed no change (`withoutNull` already handles a one-field plan); tests prove
  it rather than assume it. Verified non-vacuous by welding the fields back
  together and by dropping the ladder branch from `bucketForState`.
- 2026-09-04 — Phase 1 done. `stateSuggestions` now returns a `label`
  (`states.complete` / `release.stages[test]`) so a single printer serves both
  the bucket map and the ladder; that broke `init-config`'s remediation line,
  which still read `bucket` — the existing suite caught it. Verified the new
  tests non-vacuous by removing the stage names from `configuredStateNames` and
  watching exactly the two intended tests fail.
- 2026-09-04 — Design refined during grilling: the planned `release.cedeAfter`
  knob was dropped. Reading `compare.js:47` showed `specIssueHash` welds
  description and state, so push re-asserts state on any prose edit; diffing the
  two independently removes the conflict with no new config (Decision 4).
